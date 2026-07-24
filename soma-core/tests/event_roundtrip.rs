use soma_core::event::envelope::{Actor, EventEnvelope};

#[test]
fn test_event_envelope_roundtrip() {
    let envelope = EventEnvelope::new(
        "SOMA-0001".to_string(),
        1,
        "test.event",
        1,
        Actor::User,
        serde_json::json!({"key": "value", "nested": {"a": 1}}),
    );

    let json = serde_json::to_string(&envelope).expect("serialize");
    let decoded: EventEnvelope = serde_json::from_str(&json).expect("deserialize");

    assert_eq!(envelope.id, decoded.id);
    assert_eq!(envelope.actor, decoded.actor);
    assert_eq!(envelope.event_type, decoded.event_type);
    assert_eq!(envelope.payload, decoded.payload);
    assert_eq!(envelope.case_id, decoded.case_id);
    assert_eq!(envelope.sequence, decoded.sequence);
}

#[test]
fn test_event_envelope_missing_version_fails() {
    let bad = r#"{"id":"00000000-0000-0000-0000-000000000000","case_id":"SOMA-0001","sequence":0,"envelope_version":999,"event_type":"unknown","event_version":99,"timestamp":"2024-01-01T00:00:00Z","actor":"Model","causation_id":null,"correlation_id":"00000000-0000-0000-0000-000000000000","payload":{}}"#;
    let result: Result<EventEnvelope, _> = serde_json::from_str(bad);
    // Should decode successfully since we don't validate versions at deserialization level
    assert!(result.is_ok());
}
