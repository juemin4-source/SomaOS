use soma_protocol::command::{Request, Response};

/// 通过 stdio 与 soma-runtime 通信的客户端
pub struct StdioClient {
    request_id: u64,
}

impl Default for StdioClient {
    fn default() -> Self {
        Self::new()
    }
}

impl StdioClient {
    pub fn new() -> Self {
        Self { request_id: 0 }
    }

    fn next_id(&mut self) -> u64 {
        let id = self.request_id;
        self.request_id += 1;
        id
    }

    /// 发送请求并等待响应（Phase 1 stub：直接打印请求，返回模拟响应）
    pub async fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<Response, String> {
        let req = Request {
            jsonrpc: "2.0".into(),
            id: self.next_id(),
            method: method.into(),
            params,
        };
        let json =
            serde_json::to_string_pretty(&req).map_err(|e| format!("serialize error: {}", e))?;
        println!("[soma-client] >>> {}", json);
        // Phase 1 stub: 模拟 Runtime 返回
        Ok(Response {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: Some(serde_json::json!({"stub": true, "method": method})),
            error: None,
        })
    }
}
