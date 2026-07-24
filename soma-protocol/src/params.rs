use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseCreateParams {
    pub title: String,
    pub initial_query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseCreateResult {
    pub case_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseGetParams {
    pub case_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseGetResult {
    pub case_id: String,
    pub title: String,
    pub status: String,
    pub event_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStartParams {
    pub case_id: String,
    pub input: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStartResult {
    pub run_id: String,
    pub case_id: String,
    pub status: RunStatus,
}

/// Run 状态（与 core::run::RunStatus 语义一致，但独立定义以维持编译期隔离）
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunGetParams {
    pub run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStatusResult {
    pub run_id: String,
    pub case_id: String,
    pub status: RunStatus,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub outcome: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunCancelParams {
    pub run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunCancelResult {
    pub run_id: String,
    pub status: RunStatus,
}
