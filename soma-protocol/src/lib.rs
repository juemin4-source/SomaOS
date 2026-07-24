pub mod command;
pub mod params;
pub mod notification;

#[cfg(test)]
mod tests {
    use crate::command::*;
    use crate::params::*;
    use crate::notification::*;

    #[test]
    fn test_request_roundtrip() {
        let req = Request {
            jsonrpc: "2.0".into(),
            id: 1,
            method: "case/create".into(),
            params: serde_json::json!({"title": "test", "initial_query": "hello"}),
        };
        let json = serde_json::to_string(&req).unwrap();
        let parsed: Request = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.jsonrpc, "2.0");
        assert_eq!(parsed.id, 1);
        assert_eq!(parsed.method, "case/create");
    }

    #[test]
    fn test_response_roundtrip() {
        let resp = Response {
            jsonrpc: "2.0".into(),
            id: 1,
            result: Some(serde_json::json!({"case_id": "abc-123"})),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: Response = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, 1);
        assert!(parsed.error.is_none());
        assert_eq!(parsed.result.unwrap()["case_id"], "abc-123");
    }

    #[test]
    fn test_error_response_roundtrip() {
        let resp = Response {
            jsonrpc: "2.0".into(),
            id: 42,
            result: None,
            error: Some(ProtocolError {
                code: -32601,
                message: "Method not found".into(),
                data: None,
            }),
        };
        let json = serde_json::to_string(&resp).unwrap();
        let parsed: Response = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, 42);
        assert!(parsed.result.is_none());
        let err = parsed.error.unwrap();
        assert_eq!(err.code, -32601);
        assert_eq!(err.message, "Method not found");
    }

    #[test]
    fn test_notification_roundtrip() {
        let notif = Notification {
            jsonrpc: "2.0".into(),
            method: "run.started".into(),
            params: serde_json::json!({"case_id": "c1", "run_id": "r1"}),
        };
        let json = serde_json::to_string(&notif).unwrap();
        let parsed: Notification = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.method, "run.started");
    }

    #[test]
    fn test_method_enum_serialize() {
        let m = Method::CaseCreate;
        let json = serde_json::to_string(&m).unwrap();
        assert_eq!(json, "\"case_create\"");
    }

    #[test]
    fn test_params_roundtrip() {
        // CaseCreateParams
        let create = CaseCreateParams {
            title: "Bug fix".into(),
            initial_query: "fix the crash".into(),
        };
        let json = serde_json::to_string(&create).unwrap();
        let parsed: CaseCreateParams = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.title, "Bug fix");

        // CaseGetParams
        let get = CaseGetParams { case_id: "c-001".into() };
        let json = serde_json::to_string(&get).unwrap();
        let parsed: CaseGetParams = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.case_id, "c-001");

        // RunStartParams
        let start = RunStartParams {
            case_id: "c-001".into(),
            input: "run it".into(),
        };
        let json = serde_json::to_string(&start).unwrap();
        let parsed: RunStartParams = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.input, "run it");

        // RunStatusResult
        let status = RunStatusResult {
            run_id: "r-001".into(),
            case_id: "c-001".into(),
            status: RunStatus::Completed,
            started_at: "2026-07-24T00:00:00Z".into(),
            finished_at: Some("2026-07-24T01:00:00Z".into()),
            outcome: Some("success".into()),
        };
        let json = serde_json::to_string(&status).unwrap();
        let parsed: RunStatusResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.status, RunStatus::Completed);
        assert!(parsed.finished_at.is_some());
        assert!(parsed.outcome.is_some());

        // RunCancelResult
        let cancel = RunCancelResult {
            run_id: "r-001".into(),
            status: RunStatus::Cancelled,
        };
        let json = serde_json::to_string(&cancel).unwrap();
        let parsed: RunCancelResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.status, RunStatus::Cancelled);
    }

    #[test]
    fn test_run_notification_roundtrip() {
        let n = RunNotification {
            case_id: "c-001".into(),
            run_id: "r-001".into(),
            sequence: 3,
            event: "run.output".into(),
            data: Some(serde_json::json!({"text": "thinking..."})),
        };
        let json = serde_json::to_string(&n).unwrap();
        let parsed: RunNotification = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.sequence, 3);
        assert_eq!(parsed.event, "run.output");
        assert_eq!(parsed.data.unwrap()["text"], "thinking...");
    }
}
