/// M2 权限系统：ActionRequest → PolicyCheck → PermissionResolved 链路
///
/// PolicyEngine 决定一个能力是否可执行，以及执行前是否需要 Owner 授权。
/// 策略决策结果
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

/// 命令风险等级（针对 Shell 命令分类）
#[derive(Debug, Clone, PartialEq)]
pub enum CommandRisk {
    /// 只读安全命令（ls、cat、grep 等）
    Safe,
    /// 有写入行为的命令（npm install、cargo build 等）
    Warning { description: String },
    /// 禁止执行的破坏性命令
    Forbidden { description: String },
}

/// Shell 命令风险分类器
pub fn classify_command(command: &str) -> CommandRisk {
    let trimmed = command.trim();
    let cmd_name = trimmed.split_whitespace().next().unwrap_or("");

    // 禁止操作（硬拒绝）
    let destructive_prefixes = ["rm ", "del ", "rd ", "rmdir ", "format ", "dd ", "mkfs "];
    if destructive_prefixes.iter().any(|p| trimmed.starts_with(p)) {
        return CommandRisk::Forbidden {
            description: format!("destructive command: {}", cmd_name),
        };
    }

    // 写入操作（需授权）
    let write_commands = [
        "npm", "cargo", "git", "touch", "mkdir", "cp", "mv", "echo",
        "node", "python", "rustc",
    ];
    if write_commands.contains(&cmd_name) {
        return CommandRisk::Warning {
            description: format!("{} may modify files", cmd_name),
        };
    }

    // 只读安全命令
    let safe_commands = [
        "ls", "cat", "head", "tail", "grep", "find", "wc", "sort",
        "uniq", "cut", "tr", "diff", "pwd", "date", "which", "type",
    ];
    if safe_commands.contains(&cmd_name) {
        return CommandRisk::Safe;
    }

    // 未知命令 → 保守处理为 Warning
    CommandRisk::Warning {
        description: format!("unknown command: {}", cmd_name),
    }
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
        match classify_command("git push") {
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
}
