//! # detect_workspace — 工作区自动检测
//!
//! 在 TUI 启动前调用，收集项目信息用于启动摘要渲染。
//!
//! ## 检测流程
//! 1. 确定工作区根目录（当前 cwd）
//! 2. 检测 Git 仓库状态（branch, dirty, changed files）
//! 3. 扫描项目类型（Cargo.toml, package.json 等）
//! 4. 检测构建工具
//! 5. 读取权限模式（环境变量）
//! 6. 加载最近会话（for 恢复提示）

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::workspace::context::{BuildTool, ChangedFile, PermissionMode, ProjectKind, WorkspaceContext};

/// 检测工作区上下文
///
/// 同步函数，内部使用线程 + 超时执行 git 命令。
/// `cwd` 是工作区根目录的路径。
pub fn detect_workspace(cwd: &Path) -> WorkspaceContext {
    let mut ctx = WorkspaceContext::new(cwd.to_path_buf());

    // 1. 检测 Git 仓库状态
    detect_git(cwd, &mut ctx);

    // 2. 检测项目类型和构建工具
    detect_project_kinds(cwd, &mut ctx);

    // 3. 从环境变量读取权限模式
    ctx.permission_mode = PermissionMode::from_env();

    ctx
}

/// 检测 Git 仓库状态
fn detect_git(cwd: &Path, ctx: &mut WorkspaceContext) {
    // 查找 .git 目录
    let git_dir = find_git_dir(cwd);
    let git_root = match git_dir {
        Some(ref dir) => dir.parent().map(|p| p.to_path_buf()),
        None => None,
    };

    ctx.git_root = git_root.clone();
    if git_root.is_none() {
        return; // 不是 git 仓库
    }

    ctx.branch = get_git_branch(cwd);
    ctx.changed_files = get_git_changed_files(cwd);
}

/// 向上查找 .git 目录
fn find_git_dir(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start.to_path_buf());
    while let Some(dir) = current {
        let git_dir = dir.join(".git");
        if git_dir.is_dir() {
            return Some(git_dir);
        }
        current = dir.parent().map(|p| p.to_path_buf());
    }
    None
}

/// 获取当前 Git 分支名
fn get_git_branch(cwd: &Path) -> Option<String> {
    let output = run_git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"], Duration::from_secs(5))?;
    let branch = output.trim();
    if branch.is_empty() || branch == "HEAD" {
        return None;
    }
    Some(branch.to_string())
}

/// 获取已变更的文件列表
fn get_git_changed_files(cwd: &Path) -> Vec<ChangedFile> {
    let output = match run_git(cwd, &["status", "--porcelain"], Duration::from_secs(5)) {
        Some(out) => out,
        None => return Vec::new(),
    };

    output
        .lines()
        .filter_map(|line| {
            if line.len() < 3 {
                return None;
            }
            let status = line[..2].trim().to_string();
            let path = line[3..].to_string();
            if status.is_empty() {
                None
            } else {
                Some(ChangedFile { path, status })
            }
        })
        .collect()
}

/// 运行 git 命令并返回 stdout
fn run_git(cwd: &Path, args: &[&str], timeout: Duration) -> Option<String> {
    let git_exe = resolve_git_exe();

    // 使用 std::process::Command + 超时线程
    let mut cmd = std::process::Command::new(&git_exe);
    cmd.args(args);
    cmd.current_dir(cwd);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to spawn git");
            return None;
        }
    };

    // 等待子进程完成（线程 + 超时）
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => {
            if output.status.success() {
                String::from_utf8(output.stdout).ok()
            } else {
                None
            }
        }
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "Git command failed");
            None
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            tracing::warn!("Git command timed out after {:?}", timeout);
            // 子进程可能还在运行，但我们在启动时不能阻塞太久
            None
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            tracing::warn!("Git command thread panicked");
            None
        }
    }
}

/// 解析 git 可执行文件路径
fn resolve_git_exe() -> String {
    // 1. 环境变量优先
    if let Ok(path) = std::env::var("SOMA_GIT_PATH") {
        if !path.is_empty() {
            return path;
        }
    }

    // 2. 先检查 PATH 中的 git 是否可用
    if is_git_available("git") {
        return "git".to_string();
    }
    if cfg!(windows) && is_git_available("git.exe") {
        return "git.exe".to_string();
    }

    // 3. Windows 常见安装路径
    if cfg!(windows) {
        let common_paths = vec![
            r"C:\Program Files\Git\bin\git.exe",
            r"C:\Program Files (x86)\Git\bin\git.exe",
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
        ];
        for path in &common_paths {
            if std::path::Path::new(path).exists() {
                return path.to_string();
            }
        }
    }

    // 4. 放弃——返回 "git" 让系统报错
    "git".to_string()
}

/// 检查给定的可执行文件名是否能在 PATH 中找到
fn is_git_available(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

/// 检测项目类型和构建工具
fn detect_project_kinds(cwd: &Path, ctx: &mut WorkspaceContext) {
    // 检查 Cargo.toml
    if cwd.join("Cargo.toml").exists() {
        ctx.project_kinds.push(ProjectKind::Rust);
        ctx.build_tools.push(BuildTool::Cargo);
    }

    // 检查 package.json
    let pkg_json = cwd.join("package.json");
    if pkg_json.exists() {
        // 判断 TypeScript (检测 tsconfig.json 或 package.json 中包含 typescript)
        let has_tsconfig = cwd.join("tsconfig.json").exists();
        let has_ts_dep = has_typescript_dep(&pkg_json);

        if has_tsconfig || has_ts_dep {
            ctx.project_kinds.push(ProjectKind::TypeScript);
        } else {
            ctx.project_kinds.push(ProjectKind::JavaScript);
        }

        // 检测构建工具
        if cwd.join("pnpm-lock.yaml").exists() {
            ctx.build_tools.push(BuildTool::Pnpm);
        } else if cwd.join("yarn.lock").exists() {
            ctx.build_tools.push(BuildTool::Yarn);
        } else {
            ctx.build_tools.push(BuildTool::Npm);
        }
    }

    // 检查 Python
    if cwd.join("requirements.txt").exists()
        || cwd.join("pyproject.toml").exists()
        || cwd.join("setup.py").exists()
    {
        ctx.project_kinds.push(ProjectKind::Python);
        ctx.build_tools.push(BuildTool::Pip);
    }

    // 检查 Go
    if cwd.join("go.mod").exists() {
        ctx.project_kinds.push(ProjectKind::Go);
        ctx.build_tools.push(BuildTool::GoMod);
    }
}

/// 检测 package.json 是否包含 TypeScript 依赖
fn has_typescript_dep(pkg_json: &Path) -> bool {
    let content = match std::fs::read_to_string(pkg_json) {
        Ok(c) => c,
        Err(_) => return false,
    };
    // 简单字符串检查，不需要解析 JSON
    content.contains("\"typescript\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::{BuildTool, PermissionMode, ProjectKind};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    /// 每个测试使用独立的临时目录，避免并行冲突
    fn unique_temp_dir(name: &str) -> PathBuf {
        let n = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir()
            .join("soma-workspace-test")
            .join(format!("{}-{}", name, n));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 保存和恢复环境变量
    struct EnvGuard {
        key: String,
        old: Option<String>,
    }

    impl EnvGuard {
        fn new(key: &str) -> Self {
            let old = std::env::var(key).ok();
            Self {
                key: key.to_string(),
                old,
            }
        }

        fn set(&self, val: &str) {
            std::env::set_var(&self.key, val);
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.old {
                Some(v) => std::env::set_var(&self.key, v),
                None => std::env::remove_var(&self.key),
            }
        }
    }

    #[test]
    fn test_detect_workspace_non_git_dir() {
        let dir = unique_temp_dir("non_git");
        let ctx = detect_workspace(&dir);
        assert_eq!(ctx.name, dir.file_name().unwrap().to_string_lossy());
        assert!(ctx.git_root.is_none());
        assert!(ctx.branch.is_none());
        assert!(ctx.changed_files.is_empty());
        assert!(ctx.project_kinds.is_empty());
        assert_eq!(ctx.permission_mode, PermissionMode::TrustedWorkspace);
    }

    #[test]
    fn test_detect_project_kinds_rust() {
        let dir = unique_temp_dir("rust");
        fs::write(dir.join("Cargo.toml"), "[package]\nname = \"test\"\n").unwrap();
        let ctx = detect_workspace(&dir);
        assert!(ctx.project_kinds.contains(&ProjectKind::Rust));
        assert!(ctx.build_tools.contains(&BuildTool::Cargo));
    }

    #[test]
    fn test_detect_project_kinds_typescript() {
        let dir = unique_temp_dir("ts");
        let pkg = r#"{"dependencies": {"typescript": "^5.0"}}"#;
        fs::write(dir.join("package.json"), pkg).unwrap();
        let ctx = detect_workspace(&dir);
        assert!(ctx.project_kinds.contains(&ProjectKind::TypeScript));
    }

    #[test]
    fn test_detect_project_kinds_javascript() {
        let dir = unique_temp_dir("js");
        let pkg = r#"{"name": "test"}"#;
        fs::write(dir.join("package.json"), pkg).unwrap();
        let ctx = detect_workspace(&dir);
        assert!(ctx.project_kinds.contains(&ProjectKind::JavaScript));
    }

    #[test]
    fn test_find_git_dir() {
        let dir = unique_temp_dir("git_find");
        assert!(find_git_dir(&dir).is_none());

        fs::create_dir(dir.join(".git")).unwrap();
        let found = find_git_dir(&dir);
        assert!(found.is_some());
        assert_eq!(found.unwrap(), dir.join(".git"));
    }

    #[test]
    fn test_find_git_dir_parent() {
        let dir = unique_temp_dir("git_parent");
        let sub = dir.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::create_dir(dir.join(".git")).unwrap();
        let found = find_git_dir(&sub);
        assert!(found.is_some());
        assert_eq!(found.unwrap(), dir.join(".git"));
    }

    #[test]
    fn test_run_git_non_git_dir() {
        let dir = unique_temp_dir("git_none");
        let result = run_git(&dir, &["status"], Duration::from_secs(3));
        assert!(result.is_none() || result.as_deref() == Some(""));
    }

    #[test]
    fn test_get_git_branch_no_repo() {
        let dir = unique_temp_dir("branch_none");
        let branch = get_git_branch(&dir);
        assert!(branch.is_none());
    }

    #[test]
    fn test_get_git_changed_files_no_repo() {
        let dir = unique_temp_dir("changed_none");
        let files = get_git_changed_files(&dir);
        assert!(files.is_empty());
    }

    #[test]
    fn test_permission_mode_from_env() {
        let guard = EnvGuard::new("SOMA_PERMISSION_MODE");

        // 默认（没有变量或奇怪的值）
        std::env::remove_var("SOMA_PERMISSION_MODE");
        assert_eq!(PermissionMode::from_env(), PermissionMode::TrustedWorkspace);

        guard.set("ask_on_write");
        assert_eq!(PermissionMode::from_env(), PermissionMode::AskOnWrite);

        guard.set("read_only");
        assert_eq!(PermissionMode::from_env(), PermissionMode::ReadOnly);
    }

    #[test]
    fn test_resolve_git_exe_does_not_panic() {
        let _ = resolve_git_exe();
    }

    #[test]
    fn test_detect_empty_dir() {
        let dir = unique_temp_dir("empty");
        let ctx = detect_workspace(&dir);
        assert!(ctx.project_kinds.is_empty());
        assert!(ctx.build_tools.is_empty());
    }

    #[test]
    fn test_workspace_context_new() {
        let dir = unique_temp_dir("new");
        let ctx = WorkspaceContext::new(dir.clone());
        assert_eq!(ctx.root, dir);
        assert_eq!(ctx.permission_mode, PermissionMode::TrustedWorkspace);
    }
}
