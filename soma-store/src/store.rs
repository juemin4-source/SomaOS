use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseEvent {
    pub case_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub version: u64,
}

/// CaseStore trait for event-sourced case data.
/// Implementations provide durable append-only event storage.
pub trait CaseStore: Send + Sync {
    fn append(&self, case_id: &str, event: &CaseEvent) -> Result<(), String>;
    fn replay(&self, case_id: &str) -> Result<Vec<CaseEvent>, String>;
}
