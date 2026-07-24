pub mod client;

#[cfg(test)]
mod tests {
    use crate::client::StdioClient;

    /// 测试 send_request 的行为
    /// - 若 runtime 不可用，返回友好错误
    /// - 若 runtime 可用，返回响应（可能含应用层错误）
    #[tokio::test]
    async fn test_send_request_basic() {
        let mut client = StdioClient::new();
        let resp = client
            .send_request("case/create", serde_json::json!({"title": "test"}))
            .await;

        match resp {
            Ok(response) => {
                // runtime 可用 —— 响应中可能有应用层错误（缺 initial_query）
                // 但 transport 层面是成功的
                assert_eq!(response.jsonrpc, "2.0");
            }
            Err(e) => {
                // runtime 不可用 —— 检查友好提示
                assert!(
                    e.contains("soma-runtime"),
                    "should mention soma-runtime, got: {}",
                    e
                );
            }
        }
    }
}
