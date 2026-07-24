pub mod client;

#[cfg(test)]
mod tests {
    use crate::client::StdioClient;

    #[tokio::test]
    async fn test_send_request_returns_response() {
        let mut client = StdioClient::new();
        let resp = client
            .send_request("case/create", serde_json::json!({"title": "test"}))
            .await
            .expect("should return response");
        assert_eq!(resp.jsonrpc, "2.0");
        assert!(resp.error.is_none());
        let result = resp.result.expect("should have result");
        assert_eq!(result["stub"], true);
        assert_eq!(result["method"], "case/create");
    }

    #[tokio::test]
    async fn test_request_id_increments() {
        let mut client = StdioClient::new();
        let resp1 = client
            .send_request("case/create", serde_json::json!({}))
            .await
            .unwrap();
        let resp2 = client
            .send_request("run/start", serde_json::json!({}))
            .await
            .unwrap();
        // IDs should increment
        assert!(resp2.id > resp1.id);
        // Response IDs should match request IDs
        assert_eq!(resp1.id, 0);
        assert_eq!(resp2.id, 1);
    }
}
