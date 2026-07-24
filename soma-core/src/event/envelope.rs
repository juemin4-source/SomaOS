use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Actor {
    User,
    System,
    Model,
    Capability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: Uuid,
    pub case_id: String,
    pub sequence: u64,
    pub envelope_version: u16,
    pub event_type: String,
    pub event_version: u16,
    pub timestamp: DateTime<Utc>,
    pub actor: Actor,
    pub causation_id: Option<Uuid>,
    pub correlation_id: Uuid,
    pub payload: serde_json::Value,
}

impl EventEnvelope {
    pub fn new(
        case_id: String,
        sequence: u64,
        event_type: &str,
        event_version: u16,
        actor: Actor,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            case_id,
            sequence,
            envelope_version: 1,
            event_type: event_type.to_string(),
            event_version,
            timestamp: Utc::now(),
            actor,
            causation_id: None,
            correlation_id: Uuid::new_v4(),
            payload,
        }
    }
}
