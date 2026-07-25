use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

// GATE-SOMA-FIRST-COMBO: Review Combo definition
//
// LEGACY-ASSET-RECLAIM-REVIEW completed 2026-07-25.
// Softills sourced from three verified origins:
//   gstack-diff-scope         → project-level scope classification (bin)
//   code-review-diff-reader   → file-level diff details (JS handler, 4775B)
//   soma-repo-diff/status     → git via MCP (soma-repo server)
//   soma-file-search          → code search via MCP
// Workflow informed by combo-lab code-review combo's 6-node DAG.
//
// Review Combo 产出类型
//
// Scope Check
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
    // 来源: LEGACY-ASSET-RECLAIM-REVIEW — 已验证真实可用的资产

    // gstack-diff-scope: 项目级 scope 分类 (backend/test/docs/api/auth 等布尔标记)
    combo.softills.push(Softill::new(
        "change-scope-classify",
        "Change Scope Classification",
        "Classify a diff's scope into project-level categories (backend, frontend, tests, docs, etc.).",
        SoftillInvocation::Command {
            command: "gstack-diff-scope".into(),
            args_template: "<base_branch>".into(),
        },
        "read-only",
    ));

    // code-review-diff-reader: 文件级改动详情（路径、hunk、增减行、语言检测）
    combo.softills.push(Softill::new(
        "code-review-diff-reader",
        "Diff Reader",
        "Read and structure git diff data: file list, hunks, added/removed lines, language detection.",
        SoftillInvocation::Script {
            path: "somaos-combo-lab/.claude/softills/code-review-diff-reader/handler.mjs".into(),
            interpreter: "node".into(),
        },
        "read-only",
    ));

    // soma-repo-diff: Git diff via MCP
    combo.softills.push(Softill::new(
        "repo-diff",
        "Repository Diff",
        "View git diff of a local repository. Available via mcp__soma-repo__soma_repo_diff.",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_diff".into(),
        },
        "read-only",
    ));

    // soma-repo-status: Git status via MCP
    combo.softills.push(Softill::new(
        "repo-status",
        "Repository Status",
        "View git repository status. Available via mcp__soma-repo__soma_repo_status.",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_status".into(),
        },
        "read-only",
    ));

    // soma-file-search: 代码内容搜索
    combo.softills.push(Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents with pattern matching. Available via mcp__soma-repo__soma_file_search.",
        SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
        },
        "read-only",
    ));

    // ── Organ 依赖 ──
    // Git, File, Process 已在 SomaOS 中实现
    // MCP 工具 (soma-repo) 通过外部 MCP 服务器提供

    combo.organ_dependencies = vec![
        "git".into(),    // git diff, git log, git merge-base
        "file".into(),   // read source files
        "mcp".into(),    // MCP tools (soma-repo server)
    ];

    // ── 工作流程 ──
    // 参考: combo-lab code-review combo (6-node DAG)
    // nodes: strategy-select → context-gather → diff-analysis + pattern-matching → report-generation → evidence-collection

    combo.workflow = r#"Review Workflow

1. Strategy Select — 根据 diff 大小、风险等级、代码类型选择策略
   Softill: change-scope-classify (gstack-diff-scope)

2. Context Gather — 收集审查上下文：diff、commit 历史、相关文件
   Softill: diff-reader + repo-diff + repo-status + file-search

3. Diff Analysis — 分析 diff 内容，识别变更模式、风险区域
   Softill: diff-reader (文件级结构化分析)
   Parallel: pattern-matching

4. Pattern Matching — 确定性模式检查（并行于 diff analysis）
   Softill: code-review-pattern-matcher (来自 combo-lab)

5. Report Generation — 合并分析结果，生成结构化审阅报告
   Softill: code-review-report-generator (来自 combo-lab)

6. Evidence Collection — 收集审查证据（仅 verified 模式）
   Softill: code-review-evidence-collector (来自 combo-lab)

7. Scope Drift Detection — 对比意图与实际改动
8. Gate Decision — PASS / FAIL / BLOCKED
9. Persist Results
"#.to_string();

    // ── 完成标准 ──

    combo.completion_criteria = vec![
        "All P1 issues resolved or explicitly skipped".into(),
        "Review result persisted".into(),
    ];

    // ── 产物 ──
    // 参考: combo-lab code-review combo 的 6 节点 DAG

    combo.outputs = vec![
        "Scope Classification (BACKEND/FRONTEND/TESTS/DOCS/API/AUTH...)".into(),
        "Diff Analysis (files, hunks, added/removed lines, languages)".into(),
        "Pattern Findings (from pattern-matcher checks)".into(),
        "Scope Check (CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING)".into(),
        "Findings list with severity, confidence, file:line, fix".into(),
        "Quality Score (0-10)".into(),
        "Gate Result (PASS / FAIL / BLOCKED)".into(),
        "Evidence Report (for verified mode)".into(),
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
        assert_eq!(c.softills.len(), 5);
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
