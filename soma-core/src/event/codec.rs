use crate::event::envelope::{Actor, EventEnvelope};

/// 存储层事件（与 SQLite schema 对应）
#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub id: String,
    pub case_id: String,
    pub sequence: u64,
    pub envelope_version: u16,
    pub event_type: String,
    pub event_version: u16,
    pub actor: String,
    pub payload: String,
    pub created_at: String,
}

/// EventCodec V1: EventEnvelope ↔ StoredEvent
///
/// 策略：可逆的事件日志。decode 时验证 event_type + event_version。
/// M0 支持的事件子集：turn.started, model.text_delta, model.reasoning_delta,
/// action.requested, action.completed, turn.response_completed,
/// observation.accepted, claim.proposed
pub struct EventCodecV1;

impl EventCodecV1 {
    pub fn encode(envelope: &EventEnvelope) -> Result<StoredEvent, String> {
        let payload = serde_json::to_string(&envelope.payload)
            .map_err(|e| format!("payload serialize: {}", e))?;
        Ok(StoredEvent {
            id: envelope.id.to_string(),
            case_id: envelope.case_id.clone(),
            sequence: envelope.sequence,
            envelope_version: envelope.envelope_version,
            event_type: envelope.event_type.clone(),
            event_version: envelope.event_version,
            actor: format!("{:?}", envelope.actor),
            payload,
            created_at: envelope.timestamp.to_rfc3339(),
        })
    }

    pub fn decode(stored: &StoredEvent) -> Result<EventEnvelope, String> {
        // Fail Closed: 未知 event_type
        match stored.event_type.as_str() {
            "turn.started" | "model.text_delta" | "model.reasoning_delta"
            | "action.requested" | "action.completed" | "turn.response_completed"
            | "observation.accepted" | "claim.proposed" => {}
            _ => return Err(format!("unsupported event type: {} v{}", stored.event_type, stored.event_version)),
        }

        // Fail Closed: 未知 event_version
        if stored.event_version != 1 {
            return Err(format!("unsupported event version: {} v{}", stored.event_type, stored.event_version));
        }

        let id = stored.id.parse().map_err(|_| "invalid event id uuid".to_string())?;
        let payload: serde_json::Value = serde_json::from_str(&stored.payload)
            .map_err(|e| format!("payload deserialize: {}", e))?;
        let ts: chrono::DateTime<chrono::Utc> = stored.created_at.parse()
            .map_err(|_| "invalid timestamp".to_string())?;

        let actor = match stored.actor.to_lowercase().as_str() {
            "user" => Actor::User,
            "model" => Actor::Model,
            "system" => Actor::System,
            "capability" => Actor::Capability,
            _ => Actor::System,
        };

        Ok(EventEnvelope {
            id,
            case_id: stored.case_id.clone(),
            sequence: stored.sequence,
            envelope_version: stored.envelope_version,
            event_type: stored.event_type.clone(),
            event_version: stored.event_version,
            timestamp: ts,
            actor,
            causation_id: None,
            correlation_id: id,
            payload,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_envelope() -> EventEnvelope {
        EventEnvelope::new(
            "SOMA-TEST".to_string(), 1, "turn.started", 1, Actor::User,
            serde_json::json!({"question": "why 404?"}),
        )
    }

    #[test]
    fn test_v1_roundtrip() {
        let e = sample_envelope();
        let stored = EventCodecV1::encode(&e).unwrap();
        let decoded = EventCodecV1::decode(&stored).unwrap();
        assert_eq!(e.id, decoded.id);
        assert_eq!(e.event_type, decoded.event_type);
        assert_eq!(e.actor, decoded.actor);
        assert_eq!(e.payload, decoded.payload);
    }

    #[test]
    fn test_unknown_event_type_fails() {
        let mut e = sample_envelope();
        e.event_type = "unknown.event".to_string();
        let stored = EventCodecV1::encode(&e).unwrap();
        assert!(EventCodecV1::decode(&stored).is_err());
    }

    #[test]
    fn test_unknown_event_version_fails() {
        let mut e = sample_envelope();
        e.event_version = 99;
        let stored = EventCodecV1::encode(&e).unwrap();
        assert!(EventCodecV1::decode(&stored).is_err());
    }

    #[test]
    fn test_all_m0_event_types() {
        let types = vec![
            "turn.started", "model.text_delta", "model.reasoning_delta",
            "action.requested", "action.completed", "turn.response_completed",
            "observation.accepted", "claim.proposed",
        ];
        for t in types {
            let e = EventEnvelope::new(
                "SOMA-TEST".to_string(), 1, t, 1, Actor::Model,
                serde_json::json!({"test": true}),
            );
            let stored = EventCodecV1::encode(&e).unwrap();
            let decoded = EventCodecV1::decode(&stored).unwrap();
            assert_eq!(decoded.event_type, t);
        }
    }
}
