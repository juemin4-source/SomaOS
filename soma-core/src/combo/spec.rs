use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecDocument {
    pub title: String,
    pub status: String,
    pub scope: Vec<String>,
    pub out_of_scope: Vec<String>,
    pub technical_notes: Vec<String>,
    pub draft_body: String,
    pub quality_score: Option<f32>,
}

pub fn spec_combo() -> Combo {
    let mut combo = Combo::new(
        "spec",
        "需求规格",
        "把模糊需求转化成可执行的规格说明：理解动机、锁定范围、技术侦查、起草、质量门禁、归档。",
    );

    combo.when_to_use = vec![
        "写一份需求文档".into(),
        "把这个需求规格化".into(),
        "出个 spec".into(),
        "write a spec".into(),
    ];

    combo.skills.push(Skill::new(
        "spec-methodology",
        "需求规格方法论（源自 gstack /spec）",
        "完整的需求规格流程：理解动机、范围与边界、技术侦查、草稿审阅、质量门禁、脱敏、归档。",
        "编写功能规格或需求文档",
        r#"# 需求规格方法论

## 第一阶段：理解"为什么"

在继续之前，必须清晰回答以下五个问题。任何一个含糊都不能推进。

1. **谁**受影响？（终端用户、系统、团队——"就我一人"也是答案）
2. **当前**行为是什么？（实际发生了什么——验证过的，不是假设的）
3. **期望**行为应该是什么？
4. **为什么现在**？（阻塞了其他工作？在烧钱？正确性问题？合规风险？）
5. **怎么算完成**？（可观察、可衡量的结果——不是"感觉好了"）

### 可选查重（--dedupe，默认开启）

提取 2-4 个关键词，执行：gh issue list --search "<关键词>" --state open --limit 10

- 0 条匹配 → 继续
- 1+ 条匹配 → 展示给用户：合并到已有 Issue 还是新建？
- gh 未安装/未登录/被限速 → 跳过并提示

## 第二阶段：范围与边界

必须回答：

1. **明确排除什么？** 尽早锁定——防止后期蔓延。
2. **涉及哪些现有系统？** 文件、表、服务、端点。
3. **有顺序依赖吗？** A 必须在 B 之前完成？
4. **能交付价值的最小版本是什么？** 永远找到 MVP 切点。
5. **失败模式和回滚方案是什么？** 如果上线出问题怎么收场？

范围未锁定前不得推进。

## 第三阶段：技术侦查（硬性要求：先读代码）

**强制：在提出任何技术问题之前，必须至少读一份代码证据。**

- 如果提到了具体文件或符号 → 搜索它、读取它、在问题中引用 path:line
- 如果是项目级问题 → 读项目结构（package.json/go.mod/Cargo.toml），读相关目录
- 如果真的是全新的、没有现有代码可参考 → 明确说"我搜索了 X、Y、Z，没有找到相关代码，按全新功能处理"

然后根据需要问以下类别（跳过明显不相关的）：

- **数据模型** — 新表、列、迁移、索引
- **API** — 新端点、修改响应、向后兼容
- **后台处理** — 新任务、队列变更、幂等性、失败处理
- **UI** — 新页面、修改组件、状态管理
- **基础设施** — IaC 变更、密钥、成本影响
- **测试** — 各层怎么测、回归风险

能通过读代码回答的问题不要问。先读，再问读了也不知道的问题。

## 第四阶段：草稿审阅

呈现完整的草稿 Issue，问："这准确捕捉了你想做的吗？我哪里搞错了？"
迭代直到用户确认。

## 第四阶段.5：质量门禁（--no-gate 跳过）

由第二个 AI 模型（Codex）阅读规格，对"一个不熟悉的实施者能否据此执行"打分 0-10，列出具体歧义点。

## 第四阶段.5a：语义内容审查（在正则脱敏之前）

对最终草稿做结构化语义重读，检查正则无法捕获的问题：

1. **具体人名 + 负面评价** — 建议改为角色称呼
2. **客户/供应商名 + 负面事件** — 建议匿名化
3. **未公开的内部策略** — 标记
4. **NDA 约束内容** — 标记
5. **保密上下文泄露** — 标记

输出：SEMANTIC_REVIEW: clean | flagged
标记时询问用户：A) 编辑 B) 确认并继续 C) 取消。公开仓库禁止 B。

## 第四阶段.5b：脱敏（fail-closed）

约 30 种密钥/PII/法律模式，分三级：
- HIGH（凭据）：直接阻止
- MEDIUM（PII/法律/内部）：通过询问确认
- LOW：提示

## 第五阶段：归档

写入 .gstack/*-design-*.md，结构如下：
- 背景与动机
- 需求规格
- 范围 / 非目标
- 技术方案
- 实施计划
- 测试策略
- 发布计划
"#,
    ));

    // ── Softill: 需求规格所需软件能力 ──
    // 使用 Foundry MCP 工具搜索代码和项目历史

    combo.softills.push(Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
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
        "code-search",
        "Code Search",
        "Search codebase for patterns and symbols. (foundry MCP codebase_server)",
        SoftillInvocation::McpTool {
            tool_name: "codebase_search".into(),
        },
        "read-only",
    ));

    // ── Vendored JS Script Softills ──

    combo.softills.push(Softill {
        id: "context-extractor".into(),
        name: "Context Extractor".into(),
        description: "Extract minimal context slices from files for spec analysis. (vendored JS handler)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/context-extractor/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "paths": {"type": "array", "items": {"type": "string"}, "description": "File paths to extract context from"},
                "max_depth": {"type": "number", "description": "Directory traversal depth", "default": 3}
            },
            "required": ["paths"]
        }),
        output_description: "Context object with extracted file summaries, key symbols, and project structure notes.".into(),
        tags: vec![],
        effect: "read-only".into(),
    });

    combo.softills.push(Softill {
        id: "project-profile-detector".into(),
        name: "Project Profile Detector".into(),
        description: "Detect project characteristics, language, build system, test framework. (vendored JS handler)".into(),
        invocation: SoftillInvocation::Script {
            path: "soma-core/softills/project-profile-detector/handler.mjs".into(),
            interpreter: "node".into(),
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "cwd": {"type": "string", "description": "Project root directory to analyze"}
            }
        }),
        output_description: "Project profile: projectType, packageManager, testCommands, buildCommands, entryFiles, riskNotes.".into(),
        tags: vec![],
        effect: "read-only".into(),
    });

    combo.organ_dependencies = vec!["git".into(), "file".into(), "mcp".into()];

    combo.workflow = r#"需求规格流程

1. 第一阶段：理解动机（5 个问题 + 可选查重）
2. 第二阶段：范围与边界（5 个问题）
3. 第三阶段：技术侦查（先读代码）
4. 第四阶段：草稿审阅 + 迭代
5. 第四阶段.5：质量门禁（可选）
6. 第四阶段.5a：语义内容审查
7. 第四阶段.5b：脱敏
8. 第五阶段：归档
"#.to_string();

    combo.completion_criteria = vec![
        "五个动机问题全部回答".into(),
        "范围和非目标已定义".into(),
        "第三阶段已读代码证据".into(),
        "草稿已由用户确认".into(),
        "质量门禁已通过或跳过".into(),
        "Spec 已归档".into(),
    ];

    combo.outputs = vec![
        "SpecDocument（范围、需求、技术方案）".into(),
        ".gstack/*-design-*.md 规格文件".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_spec_structure() {
        let c = spec_combo();
        assert_eq!(c.id, "spec");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 6);
    }

    #[test]
    fn test_spec_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(spec_combo());
        assert!(reg.get("spec").is_some());
    }

    #[test]
    fn test_spec_document_serialize() {
        let d = SpecDocument {
            title: "添加搜索功能".into(),
            status: "draft".into(),
            scope: vec!["全文搜索".into()],
            out_of_scope: vec!["AI 搜索".into()],
            technical_notes: vec!["使用已有索引".into()],
            draft_body: "# Spec\n".into(),
            quality_score: Some(8.5),
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("全文搜索"));
    }
}
