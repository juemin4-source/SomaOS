use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

// GATE-SOMA-PROJECT-TAKEOVER: project-takeover Combo
//
// Assesses project state, reads existing work artifacts, and routes
// to the correct next Combo (investigate / fix / review).

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TakeoverVerdict {
    /// 任务可以继续，建议进入指定 Combo
    ProceedTo(String),
    /// 需要更多信息才能决定下一步
    NeedsClarification(String),
    /// 无法恢复——不熟悉的项目结构或语言
    CannotTakeover(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeoverReport {
    pub project_language: String,
    pub branch: String,
    pub has_uncommitted_changes: bool,
    pub modified_files: Vec<String>,
    pub existing_artifacts: Vec<String>,
    pub test_status: String,
    pub verdict: TakeoverVerdict,
}

pub fn project_takeover_combo() -> Combo {
    let mut combo = Combo::new(
        "project-takeover",
        "Project Takeover",
        "Assess project state, recover work context, and route to the correct next Combo.",
    );

    combo.when_to_use = vec![
        "take over a project".into(),
        "continue work".into(),
        "resume a task".into(),
        "接管项目".into(),
        "继续工作".into(),
        "what's the status of this project".into(),
    ];

    // ── Skill ──

    combo.skills.push(Skill::new(
        "project-assessment",
        "Project Assessment",
        "Understand project structure, language, build system, and current state.",
        "takeover or resume a project",
        r#"Project Assessment

1. Detect project language and build system
   - Check for Cargo.toml, package.json, pyproject.toml, etc.
   - Identify test framework

2. Check current branch and uncommitted changes
   - git branch --show-current
   - git status --short
   - git diff --stat

3. Find existing work artifacts
   - Check for Findings, plans, specs, TODOs
   - Check for .gstack/ or similar state directories

4. Run tests to determine current test status
   - cargo test / npm test / pytest

5. Assess next step
   - If uncommitted changes exist → likely Fix or Review
   - If tests are failing → Investigate
   - If findings exist → Review
   - If clean → no active work
"#,
    ));

    // ── Softill ──

    combo.softills.push(Softill::new(
        "repo-status",
        "Repository Status",
        "Git status via MCP tool.",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_status".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-diff",
        "Repository Diff",
        "Git diff via MCP tool.",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_diff".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-log",
        "Repository Log",
        "Git log via MCP tool.",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_log".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents.",
        SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
        },
        "read-only",
    ));

    // ── Vendored JS Script Softills ──

    combo.softills.push(Softill {
        id: "project-profile-detector".into(),
        name: "Project Profile Detector".into(),
        description: "Detect project language, build system, test framework for takeover assessment. (vendored JS handler)".into(),
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
        output_description: "Project profile with projectType, packageManager, testCommands, buildCommands, entryFiles, riskNotes.".into(),
        tags: vec![],
        effect: "read-only".into(),
    });

    combo.organ_dependencies = vec!["git".into(), "file".into(), "mcp".into()];

    combo.workflow = r#"Project Takeover Workflow

1. Detect project language and build system
2. Check branch and uncommitted changes
3. Search for existing work artifacts (.gstack/, TODOs, Findings)
4. Run tests to determine test status
5. Assess what's been done and what remains
6. Recommend next Combo: investigate / fix / review
7. Produce TakeoverReport
"#.to_string();

    combo.completion_criteria = vec![
        "Project structure understood".into(),
        "Current state assessed".into(),
        "Next Combo recommended".into(),
    ];

    combo.outputs = vec![
        "TakeoverReport (language, branch, changes, artifacts, test status)".into(),
        "Next Combo recommendation".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_takeover_combo_structure() {
        let c = project_takeover_combo();
        assert_eq!(c.id, "project-takeover");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 5);
    }

    #[test]
    fn test_takeover_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(project_takeover_combo());
        assert!(reg.get("project-takeover").is_some());
    }

    #[test]
    fn test_takeover_verdict_serialize() {
        let r = TakeoverReport {
            project_language: "TypeScript".into(),
            branch: "main".into(),
            has_uncommitted_changes: true,
            modified_files: vec!["src/lib.rs".into()],
            existing_artifacts: vec![".gstack/findings.md".into()],
            test_status: "2 failed, 1 passed".into(),
            verdict: TakeoverVerdict::ProceedTo("fix".into()),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("ProceedTo"));
        assert!(json.contains("fix"));
    }
}
