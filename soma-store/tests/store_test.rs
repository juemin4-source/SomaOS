use soma_store::sqlite::SqliteCaseStore;
use soma_store::store::{CaseEvent, CaseStore};

#[test]
fn test_sqlite_creation_and_schema_version() {
    let store = SqliteCaseStore::new(":memory:").expect("create in-memory store");
    let version = store.schema_version().expect("read schema version");
    assert!(version > 0, "schema version should be positive");
}

#[test]
fn test_sqlite_append_and_replay() {
    let store = SqliteCaseStore::new(":memory:").expect("create in-memory store");

    let event = CaseEvent {
        case_id: "case-001".to_string(),
        event_type: "test.event".to_string(),
        payload: serde_json::json!({"result": "ok"}),
        version: 1,
    };

    store.append("case-001", &event).expect("append event");

    let events = store.replay("case-001").expect("replay events");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "test.event");
    assert_eq!(events[0].version, 1);
}
