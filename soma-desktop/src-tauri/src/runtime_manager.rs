//! RuntimeManager — 管理 soma-runtime 子进程生命周期
//!
//! 职责：
//! - 启动/停止 `soma-runtime --stdio` 子进程
//! - 发送 JSON-RPC 请求并接收响应
//! - 读取异步通知
//!
//! 设计与约束：
//! - RuntimeManager 通过 `Mutex` 对外可见，所以同一时间只有一个操作
//! - `send_request` 和 `read_notification` 从同一 stdout 读取，
//!   通过 `id` 字段区分响应和通知
//! - 通知在 `send_request` 等待响应期间出现时会被丢弃（logging debug）

use std::process::Stdio;

use soma_protocol::command::{Notification, Request, Response};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

/// Runtime 进程管理器
pub struct RuntimeManager {
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    stdout: Option<BufReader<tokio::process::ChildStdout>>,
    request_id: u64,
}

impl RuntimeManager {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            stdout: None,
            request_id: 0,
        }
    }

    fn next_id(&mut self) -> u64 {
        let id = self.request_id;
        self.request_id += 1;
        id
    }

    /// 确保 runtime 子进程已启动
    pub async fn ensure_running(&mut self) -> Result<(), String> {
        if self.child.is_some() {
            return Ok(());
        }

        let mut child = Command::new("soma-runtime")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!(
                "cannot start soma-runtime: {}（请确保 soma-runtime 已编译且在 PATH 中）", e
            ))?;

        let stdin = child.stdin.take().ok_or("runtime did not provide stdin")?;
        let stdout = child.stdout.take().ok_or("runtime did not provide stdout")?;

        self.child = Some(child);
        self.stdin = Some(stdin);
        self.stdout = Some(BufReader::new(stdout));

        Ok(())
    }

    /// 发送 JSON-RPC 请求并等待响应
    ///
    /// 写入请求到 stdin，从 stdout 逐行读取直到找到匹配 id 的响应。
    /// 期间出现的通知（无 `id` 字段的 JSON 行）会被跳过。
    pub async fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.ensure_running().await?;

        let id = self.next_id();
        let req = Request {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        };

        let json = serde_json::to_string(&req)
            .map_err(|e| format!("serialize request: {}", e))?;

        // 写入 stdin
        let stdin = self.stdin.as_mut().ok_or("stdin not available")?;
        stdin.write_all(json.as_bytes()).await
            .map_err(|e| format!("write stdin: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("write newline: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("flush stdin: {}", e))?;

        // 逐行读取 stdout，寻找匹配 id 的响应
        let reader = self.stdout.as_mut().ok_or("stdout not available")?;
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line).await {
                Ok(0) => return Err("runtime stdout closed".into()),
                Ok(_) => {}
                Err(e) => return Err(format!("read stdout: {}", e)),
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // 尝试解析为 JSON
            let val: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => continue, // 非 JSON 行，跳过
            };

            // 有 id 字段 → 响应
            if let Some(resp_id) = val.get("id").and_then(|v| v.as_u64()) {
                if resp_id != id {
                    continue; // 不是我们的响应（可能是超时或乱序）
                }
                // 检查是否有错误
                if let Some(error) = val.get("error") {
                    let msg = error.get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown error");
                    let code = error.get("code")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(-1);
                    return Err(format!("RPC error {}: {}", code, msg));
                }
                // 返回 result
                return Ok(val.get("result").cloned().unwrap_or(serde_json::json!({})));
            }

            // 无 id 字段 → 通知，跳过（通知由 read_notification 或后台任务处理）
            tracing::debug!(method = ?val.get("method"), "skipped notification during send_request");
        }
    }

    /// 读取下一条通知（非阻塞语义：等待一行可用）
    ///
    /// 返回 `None` 表示子进程已退出（EOF）。
    pub async fn read_notification(&mut self) -> Result<Option<Notification>, String> {
        let reader = self.stdout.as_mut().ok_or("stdout not available")?;
        let mut line = String::new();

        match reader.read_line(&mut line).await {
            Ok(0) => Ok(None), // EOF
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                let notif: Notification = serde_json::from_str(trimmed)
                    .map_err(|e| format!("parse notification: {} (line: {})", e, trimmed))?;
                Ok(Some(notif))
            }
            Err(e) => Err(format!("read stdout: {}", e)),
        }
    }

    /// 关闭 runtime 子进程
    pub async fn shutdown(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        self.child = None;
        self.stdin = None;
        self.stdout = None;
    }
}

impl Drop for RuntimeManager {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
        }
    }
}
