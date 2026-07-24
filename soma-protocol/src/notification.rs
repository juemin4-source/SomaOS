use serde::{Deserialize, Serialize};

/// Run 生命周期通知
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunNotification {
    pub case_id: String,
    pub run_id: String,
    pub sequence: u64,
    pub event: String,  // "run.started" | "run.output" | "run.yielded" | "run.completed" | "run.failed" | "run.cancelled"
    pub data: Option<serde_json::Value>,
}
