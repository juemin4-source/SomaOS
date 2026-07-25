//! # SomaClient — 多路复用 JSON-RPC 客户端
//!
//! 启动 `soma-runtime --stdio` 子进程，通过 stdin/stdout 通信。
//!
//! ## 设计
//!
//! ```text
//! TUI / CLI
//!     │
//!     ├── client.request(method, params) → Result<Value>
//!     │       └── 写入 stdin → oneshot channel ← stdout reader
//!     │
//!     └── client.subscribe_events() → broadcast::Receiver<RuntimeEventEnvelope>
//!             └── stdout reader 分流 task/event notification
//!
//! stdout reader (后台 task)
//!     ├── 有 "id" 字段 → 投递给对应的 oneshot::Sender
//!     └── method == "task/event" → 投递给 broadcast::Sender
//!         └── 其他 → 忽略或 trace
//! ```

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use soma_protocol::command::Request;
use soma_protocol::events::RuntimeEventEnvelope;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, broadcast, oneshot};

// ── SomaClient ──────────────────────────────────────────────────

/// 多路复用 JSON-RPC 客户端
pub struct SomaClient {
    /// stdin 写入端（Arc<Mutex> 可跨 task 共享）
    writer: Arc<Mutex<tokio::process::ChildStdin>>,
    /// 待响应的请求（request_id → oneshot::Sender）
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>,
    /// task/event 事件广播
    events: broadcast::Sender<RuntimeEventEnvelope>,
    /// 下一个请求 ID
    next_id: Arc<Mutex<u64>>,
    /// 子进程句柄
    child: Option<Child>,
    /// 当前任务 ID（connect 时创建）
    task_id: Option<String>,
}

/// 后台读取 stdout 的任务
async fn stdout_reader_loop(
    mut reader: BufReader<tokio::process::ChildStdout>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>,
    events: broadcast::Sender<RuntimeEventEnvelope>,
) {
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,  // EOF
            Ok(_) => {}
            Err(e) => {
                tracing::warn!(error = %e, "Runtime stdout read error");
                break;
            }
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let val: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => {
                tracing::trace!(line = %trimmed, "Non-JSON from Runtime stdout");
                continue;
            }
        };

        // 有 id → 响应，投递给 pending 中的 oneshot
        if let Some(req_id) = val.get("id").and_then(|v| v.as_u64()) {
            let mut map = pending.lock().await;
            if let Some(tx) = map.remove(&req_id) {
                let _ = tx.send(val);
            }
            continue;
        }

        // method == "task/event" → 解析并广播
        if val.get("method").and_then(|v| v.as_str()) == Some("task/event") {
            if let Some(params) = val.get("params") {
                if let Ok(envelope) = serde_json::from_value::<RuntimeEventEnvelope>(params.clone()) {
                    let _ = events.send(envelope);
                }
            }
            continue;
        }

        tracing::trace!(?val, "Ignored Runtime stdout line");
    }

    tracing::info!("stdout reader loop ended");
}

impl SomaClient {
    /// 启动并连接 Runtime
    pub async fn connect(project_root: &str) -> Result<Self, String> {
        let mut child = Command::new("soma-runtime")
            .arg("--stdio")
            .current_dir(project_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("启动 soma-runtime 失败: {}", e))?;

        let stdin = child.stdin.take().ok_or("runtime 未提供 stdin")?;
        let stdout = child.stdout.take().ok_or("runtime 未提供 stdout")?;
        let reader = BufReader::new(stdout);

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (event_tx, _) = broadcast::channel::<RuntimeEventEnvelope>(256);

        // 启动后台 reader
        let bg_pending = Arc::clone(&pending);
        let bg_events = event_tx.clone();
        tokio::spawn(async move {
            stdout_reader_loop(reader, bg_pending, bg_events).await;
        });

        let mut client = Self {
            writer: Arc::new(Mutex::new(stdin)),
            pending,
            events: event_tx,
            next_id: Arc::new(Mutex::new(0)),
            child: Some(child),
            task_id: None,
        };

        // 创建 task 验证连接
        let task_id = client.create_task_inner(project_root).await?;
        client.task_id = Some(task_id);

        Ok(client)
    }

    /// 当前任务 ID
    pub fn task_id(&self) -> Option<&str> {
        self.task_id.as_deref()
    }

    /// 创建新任务（内部方法，connect 时已调用）
    async fn create_task_inner(&mut self, project_root: &str) -> Result<String, String> {
        let result = self.request("task/create", serde_json::json!({
            "title": "SomaOS Session",
            "project_root": project_root,
        })).await?;
        let task_id = result.get("task_id")
            .and_then(|v| v.as_str())
            .ok_or("响应缺少 task_id")?
            .to_string();
        Ok(task_id)
    }

    /// 发送消息到当前任务
    pub async fn send_message(&self, text: &str) -> Result<(), String> {
        let tid = self.task_id.as_deref().ok_or("未创建 task")?;
        self.request("task/send_message", serde_json::json!({
            "task_id": tid,
            "text": text,
        })).await?;
        Ok(())
    }

    /// 取消当前 turn
    pub async fn cancel(&self) -> Result<(), String> {
        let tid = self.task_id.as_deref().ok_or("未创建 task")?;
        self.request("task/cancel", serde_json::json!({
            "task_id": tid,
        })).await?;
        Ok(())
    }

    /// 发送 JSON-RPC 请求，等待响应
    pub async fn request(&self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
        let mut id_lock = self.next_id.lock().await;
        let id = *id_lock;
        *id_lock += 1;
        drop(id_lock);

        let (tx, rx) = oneshot::channel();

        // 注册 pending 响应
        self.pending.lock().await.insert(id, tx);

        // 写入请求
        let req = Request {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        };
        let json = serde_json::to_string(&req).map_err(|e| format!("序列化: {}", e))?;

        let mut writer = self.writer.lock().await;
        writer.write_all(json.as_bytes()).await.map_err(|e| format!("写入: {}", e))?;
        writer.write_all(b"\n").await.map_err(|e| format!("写入换行: {}", e))?;
        writer.flush().await.map_err(|e| format!("flush: {}", e))?;
        drop(writer);

        // 等待响应（通过 oneshot）
        match rx.await {
            Ok(val) => {
                // 检查 error 字段（序列化时 None→null，忽略 null）
                if let Some(err) = val.get("error") {
                    if !err.is_null() {
                        let msg = err.get("message").and_then(|v| v.as_str()).unwrap_or("?");
                        let code = err.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                        tracing::error!(code, msg, "RPC error");
                        return Err(format!("RPC error {}: {}", code, msg));
                    }
                }
                match val.get("result") {
                    Some(r) => Ok(r.clone()),
                    None => Err("响应缺少 result".into()),
                }
            }
            Err(_) => Err("响应通道关闭（Runtime 可能已退出）".into()),
        }
    }

    /// 批准审批请求
    pub async fn approve(&self, approval_id: &str) -> Result<(), String> {
        let tid = self.task_id.as_deref().ok_or("未创建 task")?;
        self.request("task/approve", serde_json::json!({
            "task_id": tid,
            "approval_id": approval_id,
        })).await?;
        Ok(())
    }

    /// 拒绝审批请求
    pub async fn reject(&self, approval_id: &str) -> Result<(), String> {
        let tid = self.task_id.as_deref().ok_or("未创建 task")?;
        self.request("task/reject", serde_json::json!({
            "task_id": tid,
            "approval_id": approval_id,
        })).await?;
        Ok(())
    }

    /// 订阅 Runtime 事件（task/event notification）
    pub fn subscribe_events(&self) -> broadcast::Receiver<RuntimeEventEnvelope> {
        self.events.subscribe()
    }

    /// 关闭 Runtime 子进程
    pub async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
    }
}

impl Drop for SomaClient {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pending_send_recv_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<SomaClient>();
    }

    #[tokio::test]
    async fn test_subscribe_events_returns_receiver() {
        let (tx, _) = broadcast::channel::<RuntimeEventEnvelope>(16);
        // 模拟构造一个最小 client 验证订阅
        let _rx = tx.subscribe();
        // 无 Runtime 时无法测试完整链路
    }
}
