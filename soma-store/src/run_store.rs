use serde::{Deserialize, Serialize};

/// Run 状态（与 core::run::RunStatus 语义一致，独立定义以维持 crate 边界）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RunStatus {
    Accepted,
    Running,
    Yielded,
    Completed,
    Failed,
    Cancelled,
}

impl RunStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, RunStatus::Completed | RunStatus::Failed | RunStatus::Cancelled)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            RunStatus::Accepted => "ACCEPTED",
            RunStatus::Running => "RUNNING",
            RunStatus::Yielded => "YIELDED",
            RunStatus::Completed => "COMPLETED",
            RunStatus::Failed => "FAILED",
            RunStatus::Cancelled => "CANCELLED",
        }
    }
}

/// 持久化的 Run 记录（与 core 中的 Run 类型对应）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecord {
    pub run_id: String,
    pub case_id: String,
    pub submitted_by: String,
    pub status: RunStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
}

/// Run 持久化接口
pub trait RunStore: Send + Sync {
    fn insert_run(&self, run: &RunRecord) -> Result<(), String>;
    fn update_run_status(&self, run_id: &str, status: RunStatus, finished_at: Option<&str>, outcome: Option<&str>) -> Result<(), String>;
    fn get_run(&self, run_id: &str) -> Result<Option<RunRecord>, String>;
    fn list_runs(&self, case_id: &str) -> Result<Vec<RunRecord>, String>;
}
