use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QAReport {
    pub test_results: Vec<String>,
    pub bugs_found: Vec<String>,
    pub bugs_fixed: Vec<String>,
    pub verdict: String,
}

pub fn qa_combo() -> Combo {
    let mut combo = Combo::new(
        "qa",
        "质量验证",
        "对代码变更进行质量验证：运行测试、检查行为、发现 Bug、验证修复。",
    );

    combo.when_to_use = vec![
        "跑一下质量验证".into(),
        "帮我 QA".into(),
        "qa this".into(),
        "质量检查".into(),
        "run tests and verify".into(),
    ];

    combo.skills.push(Skill::new(
        "qa-methodology",
        "质量验证方法论（源自 gstack /qa）",
        "对代码变更进行全面质量验证：测试运行、行为检查、Bug 发现与修复、报告输出。",
        "对代码变更进行质量验证",
        r#"# 质量验证方法论

## 前置检查

1. **检查工作区是否干净** — git status --porcelain
   - 有未提交的修改 → 询问用户：A) 自动提交 B) 暂存 C) 取消
2. **确定测试范围** — 根据 diff 范围选择受影响的功能
3. **运行测试套件** — 获取当前测试基线

## 测试维度

根据变更范围选择适用的维度：

- **单元测试** — 受影响模块的单元测试是否全部通过
- **集成测试** — 跨模块交互是否正常
- **回归测试** — 已有功能是否被破坏
- **构建验证** — 项目是否能正常构建

## Bug 处理

发现 Bug 后：
1. 确认 Bug 是否由本次变更引入
2. 如果是，尝试修复并验证
3. 如果不是，记录为已知问题

## 严重程度分级

- **Critical** — 阻塞发布，必须修复
- **High** — 功能严重受损，建议修复
- **Medium** — 功能部分受损，可选修复
- **Low** — 外观或轻微问题，可延后

## 输出

结构化 QA 报告：测试结果、Bug 列表、修复记录、最终结论。
"#,
    ));

    // ── Softill: 质量验证所需软件能力 ──
    // 使用 Foundry MCP 工具检查代码状态和变更

    combo.softills.push(Softill::new(
        "repo-status",
        "Repository Status",
        "Git status via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_status".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-log",
        "Repository Log",
        "Git commit log via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_log".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-diff",
        "Repository Diff",
        "Git diff via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_diff".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
        },
        "read-only",
    ));

    // ── Vendored JS Script Softills ──

    combo.softills.push(Softill {
        id: "test-runner".into(),
        name: "Test Runner".into(),
        description: "Execute whitelisted test commands with timeout and security. (vendored JS handler)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/test-runner/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Test command to execute"},
                "cwd": {"type": "string", "description": "Working directory"},
                "timeoutMs": {"type": "number", "description": "Timeout in milliseconds", "default": 30000},
                "allowedCommands": {"type": "array", "items": {"type": "string"}, "description": "Command whitelist"}
            },
            "required": ["command"]
        }),
        output_description: "tests-passed | test-failure | execution-error | timeout | permission-blocked | environment-missing. Includes exitCode, durationMs, failures list, stdout/stderr preview.".into(),
        effect: "write-local".into(),
    });

    combo.softills.push(Softill {
        id: "verify".into(),
        name: "Verify".into(),
        description: "Verify task completion against contract and collect evidence. (vendored JS handler)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/verify/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Task ID to verify"},
                "contract_path": {"type": "string", "description": "Path to the contract/spec"}
            },
            "required": ["task_id"]
        }),
        output_description: "Verification result with pass/fail verdict and evidence chain.".into(),
        effect: "read-only".into(),
    });

    combo.organ_dependencies = vec!["git".into(), "file".into(), "process".into(), "mcp".into()];

    combo.workflow = r#"质量验证流程

1. 前置检查（工作区状态、测试范围）
2. 运行测试套件
3. 检查测试结果
4. 发现 Bug 并修复
5. 输出 QA 报告
"#.to_string();

    combo.completion_criteria = vec![
        "测试已运行".into(),
        "所有 Critical 和 High Bug 已处理".into(),
        "QA 报告已输出".into(),
    ];

    combo.outputs = vec![
        "QAReport（测试结果、Bug 列表、修复记录）".into(),
        "质量结论（PASS / FAIL / BLOCKED）".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_qa_structure() {
        let c = qa_combo();
        assert_eq!(c.id, "qa");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 6);
    }

    #[test]
    fn test_qa_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(qa_combo());
        assert!(reg.get("qa").is_some());
    }
}
