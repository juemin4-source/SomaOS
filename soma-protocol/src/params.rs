use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDescribeParams {
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineDescribeResult {
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapSearchParams {
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapSearchResult {
    pub report: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapProposeParams {
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapProposeResult {
    pub proposal: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoftillExportParams {
    pub softill_id: String,
    pub output_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoftillExportResult {
    pub output_dir: String,
    pub file_count: u32,
    pub message: String,
}

// ── task/* 协议 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCreateParams {
    pub project_root: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCreateResult {
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskListResult {
    pub tasks: Vec<TaskSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGetResult {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub project_root: String,
    pub work_state: serde_json::Value,
    pub artifacts: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSendMessageParams {
    pub task_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSendMessageResult {
    pub task_id: String,
    pub turn_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCancelParams {
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCancelResult {
    pub task_id: String,
    pub cancelled: bool,
}

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
