use serde::{Deserialize, Serialize};

/// 持久化的 Run 记录（与 core 中的 Run 类型对应）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecord {
    pub run_id: String,
    pub case_id: String,
    pub submitted_by: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
}

/// Run 持久化接口
pub trait RunStore: Send + Sync {
    fn insert_run(&self, run: &RunRecord) -> Result<(), String>;
    fn update_run_status(&self, run_id: &str, status: &str, finished_at: Option<&str>, outcome: Option<&str>) -> Result<(), String>;
    fn get_run(&self, run_id: &str) -> Result<Option<RunRecord>, String>;
    fn list_runs(&self, case_id: &str) -> Result<Vec<RunRecord>, String>;
}
