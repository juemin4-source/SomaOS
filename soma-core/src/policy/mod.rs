/// M2 权限系统：ActionRequest → PolicyCheck → PermissionResolved 链路
///
/// PolicyEngine 决定一个能力是否可执行，以及执行前是否需要 Owner 授权。
/// GATE-SOMA-NATIVE-001 扩展：路径范围、命令白名单、Hash 绑定、预算。

use serde::{Deserialize, Serialize};

// ── Policy Decision ──

#[derive(Debug, Clone, PartialEq)]
pub enum PolicyDecision {
    /// 允许执行
    Allow,
    /// 拒绝执行，附带原因
    Deny(String),
    /// 需要 Owner 授权后才能执行
    NeedsOwner {
        /// 向 Owner 展示的原因
        reason: String,
    },
}

// ── Command Risk Classification ──

#[derive(Debug, Clone, PartialEq)]
pub enum CommandRisk {
    Safe,
    Warning { description: String },
    Forbidden { description: String },
}

/// Shell 命令风险分类器
pub fn classify_command(command: &str) -> CommandRisk {
    let trimmed = command.trim();
    let cmd_name = trimmed.split_whitespace().next().unwrap_or("");

    let destructive_prefixes = ["rm ", "del ", "rd ", "rmdir ", "format ", "dd ", "mkfs "];
    if destructive_prefixes.iter().any(|p| trimmed.starts_with(p)) {
        return CommandRisk::Forbidden {
            description: format!("destructive command: {}", cmd_name),
        };
    }

    let write_commands = [
        "npm", "cargo", "git", "touch", "mkdir", "cp", "mv", "echo",
        "node", "python", "rustc",
    ];
    if write_commands.contains(&cmd_name) {
        return CommandRisk::Warning {
            description: format!("{} may modify files", cmd_name),
        };
    }

    let safe_commands = [
        "ls", "dir", "cat", "head", "tail", "grep", "find", "wc", "sort",
        "uniq", "cut", "tr", "diff", "fc", "pwd", "date", "which", "type",
    ];
    if safe_commands.contains(&cmd_name) {
        return CommandRisk::Safe;
    }

    CommandRisk::Warning {
        description: format!("unknown command: {}", cmd_name),
    }
}

// ── GATE-SOMA-NATIVE-001: Policy Engine ──

/// 路径匹配结果
#[derive(Debug, Clone, PartialEq)]
pub enum PathScopeVerdict {
    Allowed,
    Denied(String),
}

/// 检查路径是否在允许范围内
pub fn check_path_scope(path: &str, allowed_paths: &[String], denied_paths: &[String]) -> PathScopeVerdict {
    // 先检查拒绝列表
    for denied in denied_paths {
        if simple_glob_match(path, denied) {
            return PathScopeVerdict::Denied(format!("path matches denied pattern: {}", denied));
        }
    }
    // 再检查允许列表
    for allowed in allowed_paths {
        if simple_glob_match(path, allowed) {
            return PathScopeVerdict::Allowed;
        }
    }
    PathScopeVerdict::Denied("path not in allowed scope".to_string())
}

/// 简单的 glob 匹配（支持 ** 作为"任意深度"匹配）
fn simple_glob_match(path: &str, pattern: &str) -> bool {
    if pattern == "**" {
        return true;
    }
    let pat_parts: Vec<&str> = pattern.split('/').collect();
    let path_parts: Vec<&str> = path.split('/').collect();

    // 包含 **：在 ** 位置分割，前缀和后缀分别匹配
    if let Some(star_pos) = pat_parts.iter().position(|p| *p == "**") {
        let (prefix, suffix) = pat_parts.split_at(star_pos);
        let suffix = &suffix[1..]; // 跳过 **

        // 前缀必须匹配 path 开头
        if prefix.len() > path_parts.len() {
            return false;
        }
        for (p, s) in prefix.iter().zip(path_parts.iter()) {
            if *p != "*" && p != s {
                return false;
            }
        }

        // 后缀必须匹配 path 末尾
        if suffix.len() > path_parts.len() {
            return false;
        }
        for (p, s) in suffix.iter().zip(path_parts.iter().rev()) {
            if *p != "*" && p != s {
                return false;
            }
        }

        // 中间部分（被 ** 吞掉的路径层级）可以是任意内容
        return true;
    }

    // 没有 **：如果 pattern 比 path 短，尝试从 path 末尾匹配
    if pat_parts.len() <= path_parts.len() {
        let path_suffix = &path_parts[path_parts.len() - pat_parts.len()..];
        for (p, s) in pat_parts.iter().zip(path_suffix.iter()) {
            if *p != "*" && p != s {
                return false;
            }
        }
        return true;
    }
    false
}

/// 检查路径是否为敏感文件
pub fn is_sensitive_path(path: &str) -> bool {
    let sensitive_patterns = [
        ".env",
        ".env.local",
        ".env.production",
        "**/credentials*",
        "**/secrets*",
        "**/*.key",
        "**/*.pem",
        "**/*.p12",
        "**/*.cert",
        "**/token*",
        "**/.git/config",
        "**/.git/HEAD",
        "**/.git/index",
    ];
    sensitive_patterns.iter().any(|p| simple_glob_match(path, p))
}

/// 资源预算状态追踪
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BudgetState {
    pub invocations_used: u32,
    pub total_time_ms: u64,
    pub data_read_bytes: u64,
    pub files_written: u32,
}

/// 预算检查结果
#[derive(Debug, Clone, PartialEq)]
pub enum BudgetVerdict {
    Within,
    Exceeded(String),
}

pub fn check_budget(state: &BudgetState, max_invocations: Option<u32>) -> BudgetVerdict {
    if let Some(max) = max_invocations {
        if state.invocations_used >= max {
            return BudgetVerdict::Exceeded(format!(
                "invocation limit reached: {}/{}",
                state.invocations_used, max
            ));
        }
    }
    BudgetVerdict::Within
}

/// 检查文件 hash 一致性（用于 patch 操作）
pub fn check_file_hash(file_path: &str, expected_hash: &str, repo_root: &str) -> Result<bool, String> {
    let full_path = format!("{}/{}", repo_root.trim_end_matches('/'), file_path);
    let content = std::fs::read(&full_path).map_err(|e| format!("cannot read file for hash check: {}", e))?;
    let actual_hash = simple_hash(&content);
    Ok(actual_hash == expected_hash)
}

fn simple_hash(data: &[u8]) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    Hash::hash(data, &mut hasher);
    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_safe() {
        assert_eq!(classify_command("ls -la"), CommandRisk::Safe);
        assert_eq!(classify_command("cat file.txt"), CommandRisk::Safe);
        assert_eq!(classify_command("grep pattern"), CommandRisk::Safe);
    }

    #[test]
    fn test_classify_warning() {
        match classify_command("npm install") {
            CommandRisk::Warning { .. } => {}
            other => panic!("expected Warning, got {:?}", other),
        }
        match classify_command("cargo build") {
            CommandRisk::Warning { .. } => {}
            other => panic!("expected Warning, got {:?}", other),
        }
    }

    #[test]
    fn test_classify_forbidden() {
        match classify_command("rm -rf /") {
            CommandRisk::Forbidden { .. } => {}
            other => panic!("expected Forbidden, got {:?}", other),
        }
    }

    #[test]
    fn test_classify_unknown_is_warning() {
        match classify_command("some_random_tool") {
            CommandRisk::Warning { .. } => {}
            other => panic!("expected Warning, got {:?}", other),
        }
    }

    #[test]
    fn test_path_scope_allowed() {
        let allowed = vec!["src/**".to_string(), "tests/**".to_string()];
        let denied = vec!["**/.env".to_string()];
        assert_eq!(check_path_scope("src/main.rs", &allowed, &denied), PathScopeVerdict::Allowed);
        assert_eq!(check_path_scope("tests/test.rs", &allowed, &denied), PathScopeVerdict::Allowed);
    }

    #[test]
    fn test_path_scope_denied() {
        let allowed = vec!["src/**".to_string()];
        let denied = vec!["**/.env".to_string()];
        match check_path_scope("config/.env", &allowed, &denied) {
            PathScopeVerdict::Denied(_) => {}
            other => panic!("expected Denied, got {:?}", other),
        }
        match check_path_scope("README.md", &allowed, &denied) {
            PathScopeVerdict::Denied(_) => {}
            other => panic!("expected Denied, got {:?}", other),
        }
    }

    #[test]
    fn test_sensitive_path_detection() {
        assert!(is_sensitive_path(".env"));
        assert!(is_sensitive_path("config/.env.local"));
        assert!(!is_sensitive_path("src/main.rs"));
        assert!(!is_sensitive_path("README.md"));
    }

    #[test]
    fn test_budget_check() {
        let state = BudgetState {
            invocations_used: 5,
            ..Default::default()
        };
        assert_eq!(check_budget(&state, Some(10)), BudgetVerdict::Within);
        match check_budget(&state, Some(5)) {
            BudgetVerdict::Exceeded(_) => {} // expected
            other => panic!("expected Exceeded, got {:?}", other),
        }
    }
}
