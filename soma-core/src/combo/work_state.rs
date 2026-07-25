use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::pipeline::ArtifactStore;

/// 最小工作状态 — 跨会话恢复所需的信息
///
/// 包含管线产物存储（ArtifactStore），支持跨 Combo 产物传递。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkState {
    pub task_goal: String,
    pub current_combo: String,
    pub current_stage: String,
    pub confirmed_facts: Vec<String>,
    pub existing_artifacts: Vec<String>,
    pub pending_findings: Vec<String>,
    pub last_test_result: String,
    pub modified_files: Vec<String>,
    pub pending_decisions: Vec<String>,
    pub suggested_next: String,
    /// 管线产物存储 — 各 Combo 产生的结构化产物
    pub pipeline_artifacts: ArtifactStore,
    pub version: u32,
}

impl WorkState {
    pub fn new(goal: &str) -> Self {
        Self {
            task_goal: goal.to_string(),
            current_combo: String::new(),
            current_stage: String::new(),
            confirmed_facts: vec![],
            existing_artifacts: vec![],
            pending_findings: vec![],
            last_test_result: String::new(),
            modified_files: vec![],
            pending_decisions: vec![],
            suggested_next: String::new(),
            pipeline_artifacts: ArtifactStore::new(),
            version: 1,
        }
    }

    /// 保存工作状态到文件
    pub fn save(&self, path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create state dir: {}", e))?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| format!("serialize: {}", e))?;
        std::fs::write(path, &json).map_err(|e| format!("write state: {}", e))?;
        Ok(())
    }

    /// 从文件恢复工作状态
    pub fn load(path: &PathBuf) -> Result<Self, String> {
        let json = std::fs::read_to_string(path).map_err(|e| format!("read state: {}", e))?;
        let state: WorkState = serde_json::from_str(&json).map_err(|e| format!("deserialize: {}", e))?;
        Ok(state)
    }

    /// 保存到默认路径（项目根 .somaos/state.json）
    pub fn save_to_project(&self, project_root: &PathBuf) -> Result<(), String> {
        let path = project_root.join(".somaos").join("state.json");
        self.save(&path)
    }

    /// 从默认路径加载
    pub fn load_from_project(project_root: &PathBuf) -> Result<Self, String> {
        let path = project_root.join(".somaos").join("state.json");
        Self::load(&path)
    }

    pub fn set_combo(&mut self, combo: &str, stage: &str) {
        self.current_combo = combo.to_string();
        self.current_stage = stage.to_string();
    }

    pub fn add_fact(&mut self, fact: &str) {
        self.confirmed_facts.push(fact.to_string());
    }

    pub fn add_finding(&mut self, finding: &str) {
        self.pending_findings.push(finding.to_string());
    }

    pub fn add_artifact(&mut self, path: &str) {
        self.existing_artifacts.push(path.to_string());
    }

    pub fn set_test_result(&mut self, result: &str) {
        self.last_test_result = result.to_string();
    }

    pub fn set_next(&mut self, next: &str) {
        self.suggested_next = next.to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_work_state_roundtrip() {
        let dir = std::env::temp_dir();
        let path = dir.join("test-somaos-state.json");

        let mut state = WorkState::new("fix the add function");
        state.set_combo("investigate", "Phase 3: Hypothesis Testing");
        state.add_fact("root cause: a - b instead of a + b");
        state.set_test_result("2 failed, 1 passed");
        state.set_next("code.patch → test.run");

        // 存储管线产物验证持久化
        let artifact = super::pipeline::Artifact::new(
            super::pipeline::ARTIFACT_DEBUG,
            "investigate",
            serde_json::json!({"root_cause": "wrong operator"}),
            "a - b instead of a + b",
        );
        state.pipeline_artifacts.store(artifact);

        state.save(&path).unwrap();
        let loaded = WorkState::load(&path).unwrap();

        assert_eq!(loaded.task_goal, "fix the add function");
        assert_eq!(loaded.current_combo, "investigate");
        assert_eq!(loaded.confirmed_facts.len(), 1);
        assert!(loaded.confirmed_facts[0].contains("root cause"));
        assert_eq!(loaded.suggested_next, "code.patch → test.run");

        // 验证管线产物持久化
        assert!(!loaded.pipeline_artifacts.list_types().is_empty(),
            "pipeline_artifacts should have entries after storing");
        let debug = loaded.pipeline_artifacts.get(super::pipeline::ARTIFACT_DEBUG);
        assert!(debug.is_some(), "debug artifact should survive roundtrip");
        assert_eq!(debug.unwrap().producer, "investigate");

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_work_state_progression() {
        let mut state = WorkState::new("fix bug");
        assert_eq!(state.version, 1);

        state.set_combo("investigate", "Phase 2: Pattern Analysis");
        assert_eq!(state.current_combo, "investigate");

        state.add_finding("confirmed: wrong operator on line 5");
        assert_eq!(state.pending_findings.len(), 1);
    }
}
