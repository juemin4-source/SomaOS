use serde::{Deserialize, Serialize};

use super::combo::Combo;

// GATE-SOMA-GSTACK-FULLCHAIN: office-hours Combo
//
// 原则：gstack 的 SKILL.md 就是执行体。
// 此 Combo 定义只描述如何发现、加载和接入 gstack /office-hours，
// 不重新实现方法论。

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignDecision {
    pub problem: String,
    pub recommendation: String,
    pub alternatives: Vec<String>,
    pub decision: String,
}

pub fn office_hours_combo() -> Combo {
    let mut combo = Combo::new(
        "office-hours",
        "Office Hours",
        "Clarify fuzzy ideas into concrete directions and design decisions.",
    )
    .from_gstack("office-hours");

    combo.when_to_use = vec![
        "help me think through this".into(),
        "brainstorm this".into(),
        "is this worth building".into(),
        "帮我理清思路".into(),
        "讨论方案".into(),
    ];

    // Softill: 全部复用已有资产
    combo.softills.push(crate::combo::softill::Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents via MCP.",
        crate::combo::softill::SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
        },
        "read-only",
    ));

    combo.organ_dependencies = vec!["file".into(), "mcp".into()];

    // 不嵌入方法论 body——gstack 的 SKILL.md 就是执行体
    // 执行时读取 ~/.claude/skills/gstack/office-hours/SKILL.md

    combo.workflow = r#"Office Hours Workflow

1. Load gstack /office-hours methodology
2. Apply the appropriate mode (Startup or Builder)
3. Ask forcing questions (one at a time)
4. Generate alternatives
5. Produce design decision
"#.to_string();

    combo.completion_criteria = vec![
        "Problem clearly stated".into(),
        "Alternatives evaluated".into(),
        "Design decision produced".into(),
    ];

    combo.outputs = vec![
        "DesignDecision (problem, recommendation, alternatives)".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_office_hours_combo() {
        let c = office_hours_combo();
        assert_eq!(c.id, "office-hours");
        assert!(c.gstack_source.is_some());
        assert!(c.gstack_source.unwrap().contains("office-hours"));
    }

    #[test]
    fn test_office_hours_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(office_hours_combo());
        assert!(reg.get("office-hours").is_some());
    }

    #[test]
    fn test_design_decision_serialize() {
        let d = DesignDecision {
            problem: "Should we build a Combo DSL?".into(),
            recommendation: "No, reference gstack directly.".into(),
            alternatives: vec!["Build Combo DSL".into(), "Use gstack as-is".into()],
            decision: "Reference gstack directly — don't rebuild.".into(),
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("recommendation"));
    }
}
