use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

// GATE-SOMA-FIRST-COMBO: Review Combo definition
//
// ASSET ORIGINS (after LEGACY-ASSET-RECLAIM-REVIEW):
//   methodology_source:   gstack /review (Scope Drift, Fix-First, Checklist)
//   execution_assets:    SomaOS legacy softills (combo-lab, foundry)
//   combo_skeleton:      legacy code-review combo (combo-lab, 6-node DAG)
//   related_combo:       fix-combo (combo-lab)
//   organ_layer:         FileOrgan / GitOrgan / ProcessOrgan (SomaOS)
//
// This is NOT a gstack black-box wrapper. gstack provides methodology;
// SomaOS assets provide execution.
//
// Review Combo 产出类型

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScopeVerdict {
    Clean,
    DriftDetected,
    RequirementsMissing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScopeCheck {
    pub verdict: ScopeVerdict,
    pub intent: String,
    pub delivered: String,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub severity: String,
    pub confidence: u8,
    pub file: String,
    pub line: Option<u64>,
    pub summary: String,
    pub category: String,
    pub fix: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GateVerdict {
    Pass,
    Fail,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewReport {
    pub scope_check: Option<ScopeCheck>,
    pub findings: Vec<Finding>,
    pub quality_score: f32,
    pub gate: GateVerdict,
}

/// 构建 Review Combo
///
/// SomaOS 的第一个 Combo。它不是 gstack 的包装，而是：
///   gstack 方法论（Skill）
///   + SomaOS 旧资产（Softill）
///   + SomaOS Organ
///   + 旧 code-review Combo 骨架
///   = SomaOS 原生 Review Combo
pub fn review_combo() -> Combo {
    let mut combo = Combo::new(
        "review",
        "Code Review",
        "Review code changes: detect scope drift, find issues, produce structured findings and gate result.",
    );

    combo.when_to_use = vec![
        "need a code review".into(),
        "check my diff".into(),
        "pre-landing review".into(),
        "审阅代码".into(),
        "review this PR".into(),
    ];

    // ── Skill: Review 方法论（来源：gstack /review）──
    // gstack 提供经过验证的 Review 方法论，包括 Scope Drift Detection、
    // Fix-First 原则、Checklist 分类体系、Adversarial Review 方法。
    // 这些内容原封不动继承，不为概念纯洁而拆散。

    combo.skills.push(Skill::new(
        "review-methodology",
        "Review Methodology",
        "How to review code changes systematically. (from gstack /review)",
        "any code review task",
        r#"Code Review Methodology (gstack /review)

1. Scope Drift Detection
   - Before reviewing code quality, check: did they build what was requested?
   - Identify SCOPE CREEP and MISSING REQUIREMENTS
   - Output: CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING

2. Critical Pass
   Apply checklist categories against the diff:
   - SQL & Data Safety, Race Conditions, LLM Trust Boundary
   - Shell Injection, Enum Completeness, Deserialization
   - Path Traversal, Error Handling

3. Fix-First
   Every finding gets action: AUTO-FIX or ASK (batch-present to user)

4. Adversarial Review
   Independent subagent reviews for issues the primary review missed.

5. Persist
   Save review results for downstream use.
"#,
    ));

    combo.skills.push(Skill::new(
        "scope-drift",
        "Scope Drift Detection",
        "Check if the diff delivers exactly what was requested. (from gstack /review)",
        "need to check if implementation matches requirements",
        r#"Scope Drift Detection (gstack /review)

1. Read TODOS.md, PR description, commit messages for stated intent
2. Compare with git diff --stat
3. Check for:
   - SCOPE CREEP: files changed unrelated to stated intent
   - REQUIREMENTS MISSING: requirements not addressed in diff

Output:
   Scope Check: CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING
"#,
    ));

    // ── Softill: Review 执行能力（来源：SomaOS 旧资产）──
    // 以下 Softill 均来自 LEGACY-ASSET-RECLAIM-REVIEW 确认的真实可用资产。

    combo.softills.push(Softill::new(
        "change-scope-classify",
        "Change Scope Classification",
        "Classify diff scope into project-level categories. (gstack-diff-scope bin)",
        SoftillInvocation::Command {
            command: "gstack-diff-scope".into(),
            args_template: "<base_branch>".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "code-review-diff-reader",
        "Diff Reader",
        "Read and structure git diff: files, hunks, line counts, language detection. (combo-lab JS handler)",
        SoftillInvocation::Script {
            path: "somaos-combo-lab/.claude/softills/code-review-diff-reader/handler.mjs".into(),
            interpreter: "node".into(),
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
        "repo-status",
        "Repository Status",
        "Git status via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_status".into(),
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

    // ── Organ 依赖 ──
    // FileOrgan, GitOrgan, ProcessOrgan 已在 SomaOS 中实现。
    // MCP 工具通过外部 soma-repo MCP 服务器提供。

    combo.organ_dependencies = vec![
        "git".into(),
        "file".into(),
        "process".into(),
        "mcp".into(),
    ];

    // ── 工作流程（骨架来源：combo-lab code-review combo）──
    // 旧 code-review Combo 定义了 6 节点 DAG，含并行执行和 body mode：
    //   strategy-select → context-gather → diff-analysis + pattern-matching
    //   → report-generation → evidence-collection
    // 此处取其骨架，不作为最终架构锁定。

    combo.workflow = r#"Review Workflow

1. Strategy Select
   Choose review strategy based on diff size, risk level, code type.
   Softill: change-scope-classify

2. Context Gather
   Collect diff, commit history, related files.
   Softills: diff-reader, repo-diff, repo-status, file-search

3. Diff Analysis
   Analyze diff for change patterns, risk areas, impact scope.
   Softill: diff-reader (file-level structured analysis)

4. Pattern Matching (parallel with diff analysis)
   Deterministic pattern checks against the code.
   (combo-lab code-review-pattern-matcher available)

5. Report Generation
   Merge all node outputs into structured review report.
   (combo-lab code-review-report-generator available)

6. Evidence Collection (verified mode only)
   Collect audit trail of review process.
   (combo-lab code-review-evidence-collector available)

7. Scope Drift Detection
   Compare stated intent vs actual changes.

8. Gate Decision
   PASS / FAIL / BLOCKED based on findings.

9. Persist Results
"#.to_string();

    // ── 完成标准 ──

    combo.completion_criteria = vec![
        "All P1 issues resolved or explicitly skipped".into(),
        "Review result persisted".into(),
    ];

    // ── 产物 ──

    combo.outputs = vec![
        "Scope Classification".into(),
        "Diff Analysis (files, hunks, line counts, languages)".into(),
        "Pattern Findings".into(),
        "Scope Check (CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING)".into(),
        "Findings list with severity, confidence, file:line, fix".into(),
        "Quality Score (0-10)".into(),
        "Gate Result (PASS / FAIL / BLOCKED)".into(),
        "Evidence Report (verified mode)".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_review_combo_structure() {
        let c = review_combo();
        assert_eq!(c.id, "review");
        assert_eq!(c.name, "Code Review");
        assert!(!c.description.is_empty());
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 2);
        assert_eq!(c.softills.len(), 5);
        assert!(!c.organ_dependencies.is_empty());
        assert!(!c.outputs.is_empty());
    }

    #[test]
    fn test_review_skills_have_origin_notes() {
        let c = review_combo();
        assert!(c.skills[0].body.contains("gstack"));
        assert!(c.skills[1].body.contains("gstack"));
    }

    #[test]
    fn test_review_softills_have_origin_notes() {
        let c = review_combo();
        for s in &c.softills {
            assert!(!s.description.is_empty(), "Softill {} missing description", s.id);
            assert!(s.description.contains("("),
                "Softill {} missing origin note in description: {}", s.id, s.description);
        }
    }

    #[test]
    fn test_review_combo_in_registry() {
        use crate::combo::registry::ComboRegistry;
        let mut reg = ComboRegistry::new();
        reg.register(review_combo());
        let found = reg.get("review");
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Code Review");
    }
}
