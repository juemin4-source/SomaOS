use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

// GATE-SOMA-INVESTIGATE-COMBO: Investigate Combo definition
//
// ASSET ORIGINS:
//   methodology_source:   gstack /investigate (5-phase, Iron Law, 3-Strike)
//   execution_assets:    SomaOS legacy assets + Review Combo Softills
//   combo_chain:         Investigate → Fix → Review
//
// Investigate Combo 产出类型

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InvestigationStatus {
    Done,
    DoneWithConcerns,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugReport {
    pub symptom: String,
    pub root_cause: String,
    pub fix: String,
    pub evidence: String,
    pub regression_test: Option<String>,
    pub status: InvestigationStatus,
}

/// 构建 Investigate Combo
pub fn investigate_combo() -> Combo {
    let mut combo = Combo::new(
        "investigate",
        "Investigate",
        "Investigate bugs: find root cause, produce structured debug report with fix and verification.",
    );

    combo.when_to_use = vec![
        "need to investigate a bug".into(),
        "find the root cause".into(),
        "something is broken".into(),
        "调查 Bug".into(),
        "定位根因".into(),
    ];

    // ── Skill: 调查方法论（来源：gstack /investigate）──

    combo.skills.push(Skill::new(
        "investigation-methodology",
        "Investigation Methodology",
        "Systematic bug investigation method. (from gstack /investigate)",
        "any bug investigation task",
        r#"Investigation Methodology (gstack /investigate)

IRON LAW: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

Phase 1: Root Cause Investigation
  1. Collect symptoms: error messages, stack traces, reproduction steps
  2. Read the code: trace from symptom back to potential causes
  3. Check recent changes: git log --oneline -20
  4. Reproduce: trigger the bug deterministically
  5. Check investigation history: prior learnings on same files

Phase 2: Pattern Analysis
  Check if the bug matches known patterns:
  - Race condition (intermittent, timing-dependent)
  - Nil/null propagation (missing guards)
  - State corruption (partial updates)
  - Integration failure (external API, service boundaries)
  - Configuration drift (works locally, fails in staging)
  - Stale cache (shows old data, fixes on cache clear)

Phase 3: Hypothesis Testing
  Before writing ANY fix, verify your hypothesis.
  1. Add temporary assertion at suspected root cause. Run reproduction.
  2. If hypothesis is wrong, return to Phase 1.
  3. 3-Strike rule: if 3 hypotheses fail, STOP and escalate.

Phase 4: Implementation
  1. Fix the root cause, not the symptom
  2. Minimal diff: fewest files, fewest lines
  3. Write a regression test that fails without the fix
  4. Run full test suite. No regressions allowed.
  5. If fix touches >5 files, flag blast radius.

Phase 5: Verification & Report
  Fresh verification: reproduce original bug and confirm fixed.
  Output structured DEBUG REPORT.
"#,
    ));

    // ── Softill: 调查所需软件能力 ──
    // 优先复用 Review Combo 已验证的 Softill

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
        "Read and structure git diff: files, hunks, line counts. (vendored JS handler)",
        SoftillInvocation::Script {
            path: "soma-core/softills/code-review-diff-reader.mjs".into(),
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
        "repo-log",
        "Repository Log",
        "Git commit log via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_log".into(),
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

    combo.organ_dependencies = vec![
        "git".into(),
        "file".into(),
        "process".into(),
        "mcp".into(),
    ];

    // ── 工作流程 ──

    combo.workflow = r#"Investigate Workflow

1. Symptom Collection
   Read error messages, stack traces, reproduction steps.
   Softills: file-search, repo-log

2. Code Tracing
   Trace from symptom back to potential causes.
   Softills: file-search, repo-diff, repo-log

3. Recent Change Check
   git log --oneline -20 for affected files.
   Softills: repo-log, repo-diff

4. Reproduce
   Trigger the bug deterministically.
   Softill: process-run (test execution)

5. Hypothesis Formation → Testing
   Form hypothesis, verify, 3-strike rule.
   Softills: diff-reader, file-search

6. Fix (if root cause confirmed)
   Minimal diff + regression test.
   Softills: file-patch, process-run (test), repo-diff (verify)

7. Verification & Report
   Fresh verification + structured DEBUG REPORT.
"#.to_string();

    // ── 完成标准 ──

    combo.completion_criteria = vec![
        "Root cause confirmed with evidence".into(),
        "Fix applied with regression test".into(),
        "Fresh verification passes".into(),
    ];

    // ── 产物 ──

    combo.outputs = vec![
        "Debug Report (symptom, root cause, fix, evidence)".into(),
        "Code changes (files modified)".into(),
        "Test results".into(),
        "Status (DONE / DONE_WITH_CONCERNS / BLOCKED)".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_investigate_combo_structure() {
        let c = investigate_combo();
        assert_eq!(c.id, "investigate");
        assert_eq!(c.name, "Investigate");
        assert!(!c.description.is_empty());
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 6);
        assert!(!c.organ_dependencies.is_empty());
        assert!(!c.outputs.is_empty());
    }

    #[test]
    fn test_investigate_skills_have_origin_notes() {
        let c = investigate_combo();
        assert!(c.skills[0].body.contains("gstack"));
    }

    #[test]
    fn test_investigate_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(investigate_combo());
        let found = reg.get("investigate");
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "Investigate");
    }

    #[test]
    fn test_debug_report_serialize() {
        let r = DebugReport {
            symptom: "test_add_integration fails".into(),
            root_cause: "a - b instead of a + b".into(),
            fix: "src/lib.rs line 5".into(),
            evidence: "test passes after fix".into(),
            regression_test: Some("tests/integration.rs".into()),
            status: InvestigationStatus::Done,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("root_cause"));
        assert!(json.contains("Done"));
    }
}
