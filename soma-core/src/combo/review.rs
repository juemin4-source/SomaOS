use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

/// Review Combo 产出类型
///
/// Scope Check
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

/// Finding
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

/// Gate Result
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum GateVerdict {
    Pass,
    Fail,
    Blocked,
}

/// Review Report — 完整的 Review Combo 产物
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewReport {
    pub scope_check: Option<ScopeCheck>,
    pub findings: Vec<Finding>,
    pub quality_score: f32,
    pub gate: GateVerdict,
}

/// 构建 Review Combo
///
/// 这是 SomaOS 的第一个 Combo 实例。
/// 对应 gstack 的 /review skill。
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

    // ── Skill: 审阅方法论 ──

    combo.skills.push(Skill::new(
        "review-methodology",
        "Review Methodology",
        "How to review code changes systematically.",
        "review-methodology",
        r#"Code Review Methodology

1. Scope Drift Detection
   - Before reviewing code quality, check: did they build what was requested?
   - Identify SCOPE CREEP and MISSING REQUIREMENTS
   - Output: CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING

2. Critical Pass
   Apply checklist categories against the diff:
   - SQL & Data Safety
   - Race Conditions & Concurrency
   - LLM Output Trust Boundary
   - Shell Injection
   - Enum & Value Completeness
   - Unchecked Deserialization
   - Path Traversal & File Access Safety
   - Error Handling & Fail-Close

3. Fix-First
   Every finding gets action:
   - AUTO-FIX: apply directly
   - ASK: batch-present to user for decision

4. Adversarial Review
   Independent subagent reviews the diff for issues the primary review missed.

5. Persist
   Save review results for downstream use by /ship.
"#,
    ));

    combo.skills.push(Skill::new(
        "scope-drift",
        "Scope Drift Detection",
        "Check if the diff delivers exactly what was requested.",
        "need to check if the implementation matches the requirements",
        r#"Scope Drift Detection

1. Read TODOS.md, PR description, and commit messages for stated intent
2. Compare with git diff --stat
3. Check for:
   - SCOPE CREEP: files changed unrelated to stated intent
   - REQUIREMENTS MISSING: requirements not addressed in diff

Output:
   Scope Check: CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING
"#,
    ));

    // ── Softill: Review 所需的软件能力 ──

    combo.softills.push(Softill::new(
        "gstack-diff-scope",
        "Diff Scope Analysis",
        "Analyze the scope of changes in a diff against the base branch.",
        SoftillInvocation::Command {
            command: "gstack-diff-scope".into(),
            args_template: "<base_branch>".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "gstack-review-log",
        "Review Log Persistence",
        "Persist review results for downstream use.",
        SoftillInvocation::Command {
            command: "gstack-review-log".into(),
            args_template: "".into(),
        },
        "write-local",
    ));

    combo.softills.push(Softill::new(
        "gstack-learnings-search",
        "Learnings Search",
        "Search past learnings for patterns relevant to the current review.",
        SoftillInvocation::Command {
            command: "gstack-learnings-search".into(),
            args_template: "--query <query>".into(),
        },
        "read-only",
    ));

    // ── Organ 依赖 ──

    combo.organ_dependencies = vec![
        "git".into(),    // git diff, git log, git merge-base
        "file".into(),   // read source files
        "process".into(), // run gstack scripts
    ];

    // ── 工作流程 ──

    combo.workflow = r#"Review Workflow

1. Detect platform and base branch (gh/git)
2. Check branch and diff
3. Scope Drift Detection (intent vs delivery)
4. Plan Discovery (find plan file if exists)
5. Read Checklist (load review criteria)
6. Get Diff
7. Critical Pass (checklist categories + specialist dispatch)
8. Fix-First (classify findings → auto-fix → batch-ask)
9. Adversarial Review (independent subagent)
10. Persist Results
"#.to_string();

    // ── 完成标准 ──

    combo.completion_criteria = vec![
        "All P1 issues resolved or explicitly skipped".into(),
        "Review result persisted".into(),
    ];

    // ── 产物 ──

    combo.outputs = vec![
        "Scope Check (CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING)".into(),
        "Findings list with severity, confidence, file:line, fix".into(),
        "Quality Score (0-10)".into(),
        "Gate Result (PASS / FAIL / BLOCKED)".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::combo::Combo;

    #[test]
    fn test_review_combo_structure() {
        let c = review_combo();
        assert_eq!(c.id, "review");
        assert_eq!(c.name, "Code Review");
        assert!(!c.description.is_empty());
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 2);
        assert_eq!(c.softills.len(), 3);
        assert!(!c.organ_dependencies.is_empty());
        assert!(!c.outputs.is_empty());
    }

    #[test]
    fn test_review_scope_check_serialize() {
        let sc = ScopeCheck {
            verdict: ScopeVerdict::Clean,
            intent: "Fix the add function bug".into(),
            delivered: "Fixed a - b to a + b in src/lib.rs".into(),
            issues: vec![],
        };
        let json = serde_json::to_string(&sc).unwrap();
        assert!(json.contains("Clean"));
    }

    #[test]
    fn test_finding_serialize() {
        let f = Finding {
            severity: "P1".into(),
            confidence: 9,
            file: "src/lib.rs".into(),
            line: Some(5),
            summary: "Bug: a - b returns wrong result".into(),
            category: "correctness".into(),
            fix: "Change - to +".into(),
        };
        let json = serde_json::to_string(&f).unwrap();
        assert!(json.contains("P1"));
        assert!(json.contains("src/lib.rs"));
    }

    #[test]
    fn test_gate_result_serialize() {
        let r = ReviewReport {
            scope_check: None,
            findings: vec![],
            quality_score: 8.5,
            gate: GateVerdict::Pass,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("Pass"));
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
