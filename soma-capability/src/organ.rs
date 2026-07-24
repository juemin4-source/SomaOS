use async_trait::async_trait;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// 统一 Organ trait：所有能力执行器实现此接口
#[async_trait]
pub trait Organ: Send + Sync {
    async fn execute(&self, input: Value) -> Result<Value, String>;
}

/// 文件读取/搜索能力
pub struct FileOrgan {
    repo_root: PathBuf,
}

impl FileOrgan {
    pub fn new(repo_root: PathBuf) -> Self {
        Self { repo_root }
    }

    /// 验证路径在 repo root 之内，防止路径穿越
    fn resolve_path(&self, path_str: &str) -> Result<PathBuf, String> {
        // 拒绝显式路径穿越
        if path_str.contains("..") {
            return Err(format!("path traversal denied: {}", path_str));
        }
        let requested = Path::new(path_str);
        let abs = if requested.is_absolute() {
            requested.to_path_buf()
        } else {
            self.repo_root.join(requested)
        };
        // 先检查文件存在
        if !abs.exists() {
            return Err(format!("file not found: {}", path_str));
        }
        // 规范化后验证在 repo_root 内（不强制 canonicalize，
        // 因为 tempdir 在 Windows 上可能产生不一致的规范化路径）
        let normalized = abs.components().collect::<PathBuf>();
        let repo_normalized = self.repo_root.components().collect::<PathBuf>();
        if !normalized.starts_with(&repo_normalized) {
            return Err(format!("path outside repo root: {}", path_str));
        }
        Ok(normalized)
    }
}

#[async_trait]
impl Organ for FileOrgan {
    async fn execute(&self, input: Value) -> Result<Value, String> {
        let action = input.get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing action field".to_string())?;

        match action {
            "read" => {
                let path = input.get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "missing path field".to_string())?;
                let resolved = self.resolve_path(path)?;
                let content = std::fs::read_to_string(&resolved)
                    .map_err(|e| format!("read error: {}", e))?;
                Ok(serde_json::json!({
                    "content": content,
                    "path": resolved.to_string_lossy(),
                    "size": content.len(),
                }))
            }
            "search" => {
                let pattern = input.get("pattern")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| "missing pattern field".to_string())?;
                let path = input.get("path").and_then(|v| v.as_str());

                let mut results = Vec::new();
                let walk = walkdir::WalkDir::new(&self.repo_root)
                    .max_depth(10)
                    .into_iter()
                    .filter_entry(|e| {
                        // 根目录始终包含；跳过子目录中的隐藏文件/目录
                        e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')
                    });
                for entry in walk {
                    let entry = entry.map_err(|e| format!("walk error: {}", e))?;
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    // 如果指定了 path，只搜索匹配的文件
                    if let Some(p) = path {
                        if !entry.path().ends_with(p) {
                            continue;
                        }
                    }
                    let file_path = entry.path();
                    let content = match std::fs::read_to_string(file_path) {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    for (lineno, line) in content.lines().enumerate() {
                        if line.contains(pattern) {
                            let rel = match file_path.strip_prefix(&self.repo_root) {
                                Ok(p) => p.to_string_lossy().to_string(),
                                Err(_) => file_path.file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default(),
                            };
                            results.push(serde_json::json!({
                                "file": rel,
                                "line": lineno + 1,
                                "content": line,
                            }));
                        }
                    }
                }
                Ok(serde_json::json!({
                    "matches": results,
                    "total": results.len(),
                }))
            }
            _ => Err(format!("unknown file action: {}", action)),
        }
    }
}

/// Shell 命令执行能力（白名单）
pub struct ProcessOrgan {
    repo_root: PathBuf,
    /// 允许的安全命令
    allowed_commands: &'static [&'static str],
    /// 禁止的危险命令
    forbidden_prefixes: &'static [&'static str],
}

impl ProcessOrgan {
    pub fn new(repo_root: PathBuf) -> Self {
        Self {
            repo_root,
            allowed_commands: &[
                "ls", "cat", "head", "tail", "echo", "grep", "find",
                "wc", "sort", "uniq", "cut", "tr", "diff",
                "npm", "cargo", "rustc", "node", "python",
                "git", "pwd", "date", "which", "type",
            ],
            forbidden_prefixes: &[
                "rm", "del", "rd", "rmdir", "format",
                "dd", "mkfs", "mount", "chmod", "chown",
                ">", ">>", "|", ";", "&&", "||",
            ],
        }
    }

    fn validate_command(&self, cmd: &str) -> Result<(), String> {
        let trimmed = cmd.trim();
        // 检查黑名单前缀
        for forbidden in self.forbidden_prefixes {
            if trimmed.starts_with(forbidden) {
                return Err(format!("forbidden command prefix: {}", forbidden));
            }
        }
        // 检查白名单
        let cmd_name = trimmed.split_whitespace().next().unwrap_or("");
        if self.allowed_commands.contains(&cmd_name) {
            Ok(())
        } else {
            Err(format!("command not allowed: {}", cmd_name))
        }
    }
}

#[async_trait]
impl Organ for ProcessOrgan {
    async fn execute(&self, input: Value) -> Result<Value, String> {
        let command = input.get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing command field".to_string())?;

        self.validate_command(command)?;

        let timeout_secs = input.get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(30);

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            tokio::process::Command::new("cmd")
                .args(["/C", command])
                .current_dir(&self.repo_root)
                .output(),
        ).await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                Ok(serde_json::json!({
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": output.status.code().unwrap_or(-1),
                    "success": output.status.success(),
                }))
            }
            Ok(Err(e)) => Err(format!("process error: {}", e)),
            Err(_) => Err("command timed out".to_string()),
        }
    }
}

/// Git 只读操作能力
pub struct GitOrgan {
    repo_root: PathBuf,
}

impl GitOrgan {
    pub fn new(repo_root: PathBuf) -> Self {
        Self { repo_root }
    }
}

#[async_trait]
impl Organ for GitOrgan {
    async fn execute(&self, input: Value) -> Result<Value, String> {
        let action = input.get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing action field".to_string())?;

        match action {
            "status" => {
                let output = tokio::process::Command::new("git")
                    .args(["status", "--short"])
                    .current_dir(&self.repo_root)
                    .output()
                    .await
                    .map_err(|e| format!("git error: {}", e))?;
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(serde_json::json!({
                    "status": stdout,
                    "dirty": !stdout.is_empty(),
                }))
            }
            "diff" => {
                let path = input.get("path").and_then(|v| v.as_str());
                let mut args = vec!["diff"];
                if let Some(p) = path {
                    args.push(p);
                }
                let output = tokio::process::Command::new("git")
                    .args(&args)
                    .current_dir(&self.repo_root)
                    .output()
                    .await
                    .map_err(|e| format!("git error: {}", e))?;
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(serde_json::json!({
                    "diff": stdout,
                }))
            }
            "log" => {
                let max_count = input.get("max_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10);
                let output = tokio::process::Command::new("git")
                    .args(["log", "--oneline", &format!("-{}", max_count)])
                    .current_dir(&self.repo_root)
                    .output()
                    .await
                    .map_err(|e| format!("git error: {}", e))?;
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(serde_json::json!({
                    "log": stdout,
                }))
            }
            _ => Err(format!("unknown git action: {}", action)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn test_file_read() {
        let dir = tempfile::tempdir().unwrap();
        let test_file = dir.path().join("test.txt");
        fs::write(&test_file, "hello world").unwrap();

        let organ = FileOrgan::new(dir.path().to_path_buf());
        let result = organ.execute(serde_json::json!({
            "action": "read",
            "path": "test.txt",
        })).await.unwrap();

        assert_eq!(result["content"], "hello world");
        assert_eq!(result["size"], 11);
    }

    #[tokio::test]
    async fn test_file_read_nonexistent() {
        let dir = tempfile::tempdir().unwrap();
        let organ = FileOrgan::new(dir.path().to_path_buf());
        let result = organ.execute(serde_json::json!({
            "action": "read",
            "path": "nonexistent.txt",
        })).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_search() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        // 验证文件确实存在
        fs::write(p.join("a.rs"), "fn main() {}").unwrap();
        fs::write(p.join("b.rs"), "fn test() {}").unwrap();
        assert!(p.join("a.rs").exists());
        assert!(p.join("b.rs").exists());

        let organ = FileOrgan::new(p.to_path_buf());
        let result = organ.execute(serde_json::json!({
            "action": "search",
            "pattern": "main",
        })).await.unwrap();

        assert_eq!(result["total"], 1, "total should be 1, got: {:?}", result);
        assert_eq!(result["matches"][0]["file"], "a.rs");
    }

    #[tokio::test]
    async fn test_path_traversal_blocked() {
        let dir = tempfile::tempdir().unwrap();
        let organ = FileOrgan::new(dir.path().to_path_buf());
        let result = organ.execute(serde_json::json!({
            "action": "read",
            "path": "../outside.txt",
        })).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_process_organ_whitelist() {
        let organ = ProcessOrgan::new(PathBuf::from("."));
        let result = organ.execute(serde_json::json!({
            "command": "echo hello",
            "timeout": 5,
        })).await;
        assert!(result.is_ok());
        let data = result.unwrap();
        assert_eq!(data["stdout"].as_str().unwrap().trim(), "hello");
    }

    #[tokio::test]
    async fn test_process_organ_forbidden() {
        let organ = ProcessOrgan::new(PathBuf::from("."));
        let result = organ.execute(serde_json::json!({
            "command": "rm -rf /",
            "timeout": 5,
        })).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("forbidden"));
    }

    #[tokio::test]
    async fn test_git_status() {
        let dir = tempfile::tempdir().unwrap();
        // Init a git repo
        tokio::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output().await.unwrap();

        let organ = GitOrgan::new(dir.path().to_path_buf());
        let result = organ.execute(serde_json::json!({
            "action": "status",
        })).await;
        assert!(result.is_ok());
    }
}
