use serde::{Deserialize, Serialize};

/// Soma 协议版本
pub const PROTOCOL_VERSION: &str = "0.2.0";

/// 协议方法
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Method {
    CaseCreate,
    CaseGet,
    RunStart,
    RunGet,
    RunCancel,
}

/// JSON-RPC 请求信封
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub jsonrpc: String,    // "2.0"
    pub id: u64,
    pub method: String,
    pub params: serde_json::Value,
}

/// JSON-RPC 响应信封
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<ProtocolError>,
}

/// 协议错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// Notification 信封（服务端推送）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
}
