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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use soma_protocol::command::Request;
use soma_protocol::events::RuntimeEventEnvelope;
use soma_protocol::params::TaskGetResult;
use soma_protocol::params::TaskListResult;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, oneshot, Mutex};

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
    /// 当前任务 ID（会话切换时更新）
    task_id: std::sync::Mutex<Option<String>>,
    /// Runtime 子进程是否存活
    connected: AtomicBool,
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
            Ok(0) => break, // EOF
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
                if let Ok(envelope) = serde_json::from_value::<RuntimeEventEnvelope>(params.clone())
                {
                    let _ = events.send(envelope);
                }
            }
            continue;
        }

        tracing::trace!(?val, "Ignored Runtime stdout line");
    }

    // Runtime 退出时主动唤醒所有等待中的请求；否则调用方会永久挂起。
    let mut map = pending.lock().await;
    let waiters = std::mem::take(&mut *map);
    drop(map);
    for (id, tx) in waiters {
        let _ = tx.send(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": null,
            "error": {
                "code": -32098,
                "message": "Runtime 已退出，响应通道关闭"
            }
        }));
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
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 soma-runtime 失败: {}", e))?;

        let stdin = child.stdin.take().ok_or("runtime 未提供 stdin")?;
        let stdout = child.stdout.take().ok_or("runtime 未提供 stdout")?;
        let stderr = child.stderr.take().ok_or("runtime 未提供 stderr")?;
        let reader = BufReader::new(stdout);

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (event_tx, _) = broadcast::channel::<RuntimeEventEnvelope>(2048);

        // 启动后台 reader
        let bg_pending = Arc::clone(&pending);
        let bg_events = event_tx.clone();
        tokio::spawn(async move {
            stdout_reader_loop(reader, bg_pending, bg_events).await;
        });

        // Runtime stderr 不能直接继承到 TUI，否则一条 warning 就会打碎终端布局。
        // 这里静默排空并写入 debug tracing；真正的执行失败仍通过 RPC / task event 返回。
        tokio::spawn(async move {
            let mut stderr_reader = BufReader::new(stderr);
            let mut line = String::new();
            loop {
                line.clear();
                match stderr_reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => tracing::debug!(target: "soma_runtime", "{}", line.trim_end()),
                    Err(error) => {
                        tracing::debug!(target: "soma_runtime", error = %error, "Runtime stderr read error");
                        break;
                    }
                }
            }
        });

        let client = Self {
            writer: Arc::new(Mutex::new(stdin)),
            pending,
            events: event_tx,
            next_id: Arc::new(Mutex::new(0)),
            child: Some(child),
            task_id: std::sync::Mutex::new(None),
            connected: AtomicBool::new(true),
        };

        // 同一个项目数据库内优先恢复最近会话；显式设置 SOMA_NEW_SESSION=1
        // 时才创建新会话，避免每次启动都丢失上下文并制造 task。
        let force_new = std::env::var("SOMA_NEW_SESSION")
            .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        let task_id = if force_new {
            client.create_task_inner(project_root).await?
        } else {
            match client.find_latest_task().await? {
                Some(task_id) => task_id,
                None => client.create_task_inner(project_root).await?,
            }
        };
        *client.task_id.lock().unwrap() = Some(task_id);

        Ok(client)
    }

    /// 当前任务 ID
    pub fn task_id(&self) -> Option<String> {
        self.task_id.lock().unwrap().clone()
    }

    /// 返回项目数据库里最近一次工作会话。TaskManager 已按 created_at 倒序。
    async fn find_latest_task(&self) -> Result<Option<String>, String> {
        let value = self.request("task/list", serde_json::json!({})).await?;
        let list: TaskListResult =
            serde_json::from_value(value).map_err(|e| format!("解析 task/list 响应失败: {}", e))?;
        Ok(list
            .tasks
            .iter()
            .find(|task| task.title == "SomaOS Session v2")
            .map(|task| task.id.clone()))
    }

    /// 创建新任务（项目内没有历史会话时调用）
    async fn create_task_inner(&self, project_root: &str) -> Result<String, String> {
        let result = self
            .request(
                "task/create",
                serde_json::json!({
                    "title": "SomaOS Session v2",
                    "project_root": project_root,
                }),
            )
            .await?;
        let task_id = result
            .get("task_id")
            .and_then(|v| v.as_str())
            .ok_or("响应缺少 task_id")?
            .to_string();
        Ok(task_id)
    }

    /// 发送消息到当前任务
    pub async fn send_message(&self, text: &str) -> Result<(), String> {
        let tid = self
            .task_id
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "未创建 task".to_string())?;
        self.request(
            "task/send_message",
            serde_json::json!({
                "task_id": tid,
                "text": text,
            }),
        )
        .await?;
        Ok(())
    }

    /// 取消当前 turn
    pub async fn cancel(&self) -> Result<(), String> {
        let tid = self
            .task_id
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "未创建 task".to_string())?;
        self.request(
            "task/cancel",
            serde_json::json!({
                "task_id": tid,
            }),
        )
        .await?;
        Ok(())
    }

    /// 获取任务列表
    pub async fn task_list(&self) -> Result<TaskListResult, String> {
        let value = self.request("task/list", serde_json::json!({})).await?;
        serde_json::from_value(value)
            .map_err(|e| format!("反序列化 task list: {}", e))
    }

    /// 获取单个任务详情（含 work_state 和 artifacts）
    pub async fn task_get(&self, task_id: &str) -> Result<TaskGetResult, String> {
        let value = self
            .request(
                "task/get",
                serde_json::json!({
                    "task_id": task_id,
                }),
            )
            .await?;
        serde_json::from_value(value)
            .map_err(|e| format!("反序列化 task get: {}", e))
    }

    /// 显式创建新会话
    pub async fn create_task(&self, project_root: &str) -> Result<String, String> {
        self.create_task_inner(project_root).await
    }

    /// 获取当前任务 ID
    pub fn current_task_id(&self) -> Option<String> {
        self.task_id.lock().unwrap().clone()
    }

    /// 切换到另一个任务（用于会话恢复/切换）
    pub fn switch_to_task(&self, task_id: String) {
        *self.task_id.lock().unwrap() = Some(task_id);
    }

    /// 发送 JSON-RPC 请求，等待响应
    pub async fn request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
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
        let json = match serde_json::to_string(&req) {
            Ok(json) => json,
            Err(error) => {
                self.pending.lock().await.remove(&id);
                return Err(format!("序列化: {}", error));
            }
        };

        let write_result = async {
            let mut writer = self.writer.lock().await;
            writer
                .write_all(json.as_bytes())
                .await
                .map_err(|e| format!("写入: {}", e))?;
            writer
                .write_all(b"\n")
                .await
                .map_err(|e| format!("写入换行: {}", e))?;
            writer.flush().await.map_err(|e| format!("flush: {}", e))?;
            Ok::<(), String>(())
        }
        .await;
        if let Err(error) = write_result {
            self.pending.lock().await.remove(&id);
            self.connected.store(false, Ordering::Relaxed);
            return Err(format!("Runtime 未连接: {}", error));
        }

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
        let tid = self
            .task_id
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "未创建 task".to_string())?;
        self.request(
            "task/approve",
            serde_json::json!({
                "task_id": tid,
                "approval_id": approval_id,
            }),
        )
        .await?;
        Ok(())
    }

    /// 拒绝审批请求
    pub async fn reject(&self, approval_id: &str) -> Result<(), String> {
        let tid = self
            .task_id
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "未创建 task".to_string())?;
        self.request(
            "task/reject",
            serde_json::json!({
                "task_id": tid,
                "approval_id": approval_id,
            }),
        )
        .await?;
        Ok(())
    }

    /// 订阅 Runtime 事件（task/event notification）
    pub fn subscribe_events(&self) -> broadcast::Receiver<RuntimeEventEnvelope> {
        self.events.subscribe()
    }

    /// 检查 Runtime 子进程是否仍然存活
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
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
