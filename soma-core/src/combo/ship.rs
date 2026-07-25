use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseResult {
    pub version: String,
    pub tests_passed: bool,
    pub build_passed: bool,
    pub pushed: bool,
}

pub fn ship_combo() -> Combo {
    let mut combo = Combo::new(
        "ship",
        "交付发布",
        "把代码变更安全地发布出去。铁律：没有新鲜验证证据就声称完成是不诚实的，不是高效率。",
    );

    combo.when_to_use = vec![
        "发布这个版本".into(),
        "ship it".into(),
        "交付".into(),
        "合并并发布".into(),
        "可以发布了".into(),
    ];

    combo.skills.push(Skill::new(
        "ship-methodology",
        "交付发布方法论（源自 gstack /ship）",
        "完整的代码交付流程：预检、版本号、提交、验证门禁、推送。",
        "准备发布代码变更",
        r#"# 交付发布方法论

## 前置预检

1. **检查分支** — 如果在 base branch 上，终止："你不能在 base branch 上发布。请从功能分支发布。"
2. **检查审阅结果** — Review 是否已通过？有未解决的 CRITICAL Finding 吗？
3. **检查工作区状态** — git status --porcelain

## 分发渠道检查

如果 diff 引入了新的独立 Artifact（CLI 二进制、库包、容器镜像），检查：
- 是否有 CI/CD 工作流用于构建和发布该 Artifact
- 目标平台是否已定义
- 用户如何下载或安装它

## 版本号管理

自动决定版本号的提升方式（补丁/小版本/大版本）。

## TODOS 交叉引用

对照 TODOS.md 检查本次变更是否完成了其中列出的项目。标记已完成项。

## 验证门禁（铁律）

**没有新鲜验证证据就声称完成是不诚实的，不是高效率。**

在推送之前重新验证：
1. **测试验证** — 如果验证门禁之后代码有变化，重新运行测试套件。输出新鲜结果。
2. **构建验证** — 如果有构建步骤，运行它并输出结果。

理性化预防：
- "应该没问题" → 跑一遍。
- "我很确定" → 信心不是证据。
- "我刚才测过了" → 代码已经变了，再测一次。
- "只是很小的改动" → 小改动搞崩生产的事还少吗？

测试失败 → 停止，不要推送。修复问题返回。

## 提交

每次提交只服务一个任务目标。
提交信息描述行为变化，不混入格式化、清理和无关文件。
每个提交应支持 git bisect。

## 推送

推送前检查密钥保护钩子是否安装。

## 发布后指标记录

记录本次发布的版本号、变更摘要和测试结果，供后续复盘使用。
"#,
    ));

    // ── Softill: 交付发布所需软件能力 ──
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
        "repo-diff",
        "Repository Diff",
        "Git diff via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_diff".into(),
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
        id: "evidence-collector".into(),
        name: "Evidence Collector".into(),
        description: "Collect and organize execution evidence for release audit trail. (vendored JS handler)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/evidence-collector/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "taskId": {"type": "string", "description": "Task identifier to collect evidence for"},
                "evidence": {"type": "array", "items": {"type": "object"}, "description": "Evidence entries with type, result, summary, source"}
            },
            "required": ["taskId"]
        }),
        output_description: "Evidence receipt with collected audit trail, hash chain, and verification status.".into(),
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
                "contract_path": {"type": "string", "description": "Path to the contract/spec to verify against"}
            },
            "required": ["task_id"]
        }),
        output_description: "Verification result with pass/fail verdict, evidence chain, and detailed check results.".into(),
        effect: "read-only".into(),
    });

    combo.organ_dependencies = vec!["git".into(), "file".into(), "process".into(), "mcp".into()];

    combo.workflow = r#"交付发布流程

1. 前置预检（分支、审阅结果、工作区状态）
2. 分发渠道检查
3. 版本号管理
4. TODOS 交叉引用
5. 提交（bisectable commits）
6. 验证门禁（铁律：必须新鲜证据）
7. 推送
8. 记录发布指标
"#.to_string();

    combo.completion_criteria = vec![
        "前置预检全部通过".into(),
        "新鲜测试验证证据已产生".into(),
        "构建通过".into(),
        "代码已推送".into(),
    ];

    combo.outputs = vec![
        "ReleaseResult（version, tests, build, push status）".into(),
        "版本号".into(),
        "发布指标记录".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_ship_structure() {
        let c = ship_combo();
        assert_eq!(c.id, "ship");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 6);
    }

    #[test]
    fn test_ship_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(ship_combo());
        assert!(reg.get("ship").is_some());
    }

    #[test]
    fn test_release_result_serialize() {
        let r = ReleaseResult {
            version: "1.0.0".into(),
            tests_passed: true,
            build_passed: true,
            pushed: true,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("1.0.0"));
        assert!(json.contains("true"));
    }
}
