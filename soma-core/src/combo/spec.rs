use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;

/// Spec 产出
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
        "Spec",
        "Turn a fuzzy request into an executable spec: understand why, lock scope, interrogate code, draft, quality gate, file.",
    );

    combo.when_to_use = vec![
        "write a spec".into(),
        "spec this out".into(),
        "turn this into a spec".into(),
        "写规格".into(),
        "生成需求文档".into(),
    ];

    combo.skills.push(Skill::new(
        "spec-methodology",
        "Spec Methodology (gstack /spec)",
        "Full spec process: understand why, scope/boundaries, technical interrogation, draft review, quality gate, redaction, filing.",
        "writing a spec for a feature or change",
        r#"# Spec Methodology (from gstack /spec)

## Phase 1: Understand the "Why"

Ask until all five are answered crisply:

1. **Who** is affected? (end user, system, team — "just me, solo dev" is fine)
2. **What** is the current behavior? (what IS happening — verified, not assumed)
3. **What** should the behavior be instead?
4. **Why now?** (blocking work? costing money? correctness? compliance?)
5. **How will we know it's done?** (observable, measurable outcome)

Do NOT proceed until all five are answered without hand-waving.

### Optional dedupe (--dedupe, ON by default)

Extract 2-4 keywords, run: gh issue list --search "<keywords>" --state open --limit 10

- 0 matches → continue silently
- 1+ matches → surface to user: merge with existing or file new?
- gh not installed / not authed / rate-limited → skip with message

## Phase 2: Scope and Boundaries

Ask until you can answer:

1. **What is explicitly out of scope?** Lock early — prevents creep.
2. **What existing systems does this touch?** Files, tables, services, endpoints.
3. **Are there ordering constraints?** Must A happen before B?
4. **What's the smallest version that delivers the value?** Find the MVP cut.
5. **What are the failure modes and rollback options?**

## Phase 3: Technical Interrogation

HARD REQUIREMENT: Read at least one piece of code evidence BEFORE asking.

- If a file/symbol is mentioned → Grep it, Read it, cite path:line
- If project-level → Read package.json/go.mod/Cargo.toml, relevant dirs
- Truly novel greenfield → say "I searched for X, Y, Z, found nothing"

Then ask about categories that apply (skip irrelevant ones):
- Data model: new tables, columns, migrations, indexes
- API: new endpoints, modified responses, backwards compatibility
- Background processing: new jobs, queue changes, idempotency
- UI: new pages, modified components, state management
- Infrastructure: IaC changes, secrets, cost
- Testing: layers, regression risk

## Phase 4: Draft Review

Present full draft issue. Ask: "Does this capture what you want? What did I get wrong?"
Iterate until user confirms.

## Phase 4.5: Quality Gate (--no-gate to skip)

Codex reads the spec and scores 0-10 for "executability by an unfamiliar implementer."
Lists specific ambiguities. If gate fails, revise.

## Phase 4.5a: Semantic Content Review (before redaction regex)

Re-read the FINAL draft for what regex cannot catch:

1. Named individuals with negative judgments → rephrase to role
2. Customer/vendor names with negative events → anonymize
3. Unannounced internal strategy → flag
4. NDA-bound material → flag
5. Confidential context bleed → flag

Output: SEMANTIC_REVIEW: clean | flagged
On flagged: AskUser — A) edit, B) acknowledge, C) cancel. PUBLIC repo: B disabled.

## Phase 4.5b: Fail-closed Redaction

~30 secret/PII/legal patterns across 3 tiers:
- HIGH (credentials): block
- MEDIUM (PII/legal/internal): confirm via AskUserQuestion
- LOW: surface

## Phase 5: File the Spec

Write to .gstack/*-design-*.md with structure:
- Background and motivation
- Requirements specification
- Scope / non-goals
- Technical approach
- Implementation plan
- Test strategy
- Release plan
"#,
    ));

    combo.organ_dependencies = vec!["git".into(), "file".into()];

    combo.workflow = r#"Spec Workflow

1. Phase 1: Understand the Why (5 questions + optional dedupe)
2. Phase 2: Scope and Boundaries (5 questions)
3. Phase 3: Technical Interrogation (read code first)
4. Phase 4: Draft Review + iterate
5. Phase 4.5: Quality Gate (optional, codex)
6. Phase 4.5a: Semantic Content Review
7. Phase 4.5b: Fail-closed Redaction
8. Phase 5: File the Spec
"#.to_string();

    combo.completion_criteria = vec![
        "All 5 why questions answered".into(),
        "Scope and non-goals defined".into(),
        "Code evidence read in Phase 3".into(),
        "Draft confirmed by user".into(),
        "Quality gate passed or skipped".into(),
        "Spec filed".into(),
    ];

    combo.outputs = vec![
        "SpecDocument (scope, requirements, technical approach)".into(),
        ".gstack/*-design-*.md spec file".into(),
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
            title: "Add search feature".into(),
            status: "draft".into(),
            scope: vec!["full-text search".into()],
            out_of_scope: vec!["AI-powered search".into()],
            technical_notes: vec!["uses existing index".into()],
            draft_body: "# Spec\nAdd search.\n".into(),
            quality_score: Some(8.5),
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("full-text search"));
        assert!(json.contains("8.5"));
    }
}
