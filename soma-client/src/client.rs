use std::process::Stdio;

use soma_protocol::command::{Request, Response, Notification};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

/// 通过 stdio 与 soma-runtime 通信的客户端
///
/// 启动 `soma-runtime --stdio` 子进程，通过 stdin/stdout 发送 JSON-RPC 请求。
pub struct StdioClient {
    request_id: u64,
    child: Option<Child>,
    stdin: Option<tokio::process::ChildStdin>,
    reader: Option<BufReader<tokio::process::ChildStdout>>,
    spawned: bool,
}

impl Default for StdioClient {
    fn default() -> Self {
        Self::new()
    }
}

impl StdioClient {
    pub fn new() -> Self {
        Self {
            request_id: 0,
            child: None,
            stdin: None,
            reader: None,
            spawned: false,
        }
    }

    fn next_id(&mut self) -> u64 {
        let id = self.request_id;
        self.request_id += 1;
        id
    }

    /// 确保 runtime 子进程已启动
    pub async fn ensure_running(&mut self) -> Result<(), String> {
        if self.spawned {
            return Ok(());
        }

        let mut child = Command::new("soma-runtime")
            .arg("--stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("无法启动 soma-runtime: {}（请确保 soma-runtime 已编译且在 PATH 中）", e))?;

        let stdin = child.stdin.take().ok_or("runtime 未提供 stdin")?;
        let stdout = child.stdout.take().ok_or("runtime 未提供 stdout")?;

        self.child = Some(child);
        self.stdin = Some(stdin);
        self.reader = Some(BufReader::new(stdout));
        self.spawned = true;

        Ok(())
    }

    /// 发送 JSON-RPC 请求并等待响应
    ///
    /// 自动跳过中间出现的通知（如 `task/event`），
    /// 直到找到匹配请求 id 的响应。
    pub async fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<Response, String> {
        self.ensure_running().await?;

        let id = self.next_id();
        let req = Request {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        };

        let json = serde_json::to_string(&req).map_err(|e| format!("序列化请求失败: {}", e))?;

        // 写入 stdin
        let stdin = self.stdin.as_mut().unwrap();
        stdin.write_all(json.as_bytes()).await.map_err(|e| format!("写入请求失败: {}", e))?;
        stdin.write_all(b"\n").await.map_err(|e| format!("写入换行失败: {}", e))?;
        stdin.flush().await.map_err(|e| format!("刷新 stdin 失败: {}", e))?;

        // 读取响应（跳过中间的通知）
        let reader = self.reader.as_mut().unwrap();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).await.map_err(|e| format!("读取响应失败: {}", e))?;

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // 尝试解析
            let val: serde_json::Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // 有 id 字段且匹配 → 响应
            if let Some(resp_id) = val.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    let resp: Response = serde_json::from_str(trimmed)
                        .map_err(|e| format!("解析响应失败: {} (line: {})", e, trimmed))?;
                    return Ok(resp);
                }
            }
            // 无 id 字段 → 通知，跳过
        }
    }

    /// 读取下一条通知（用于处理异步 Run 的进度推送）
    ///
    /// 在 `run/start` 成功后调用，循环读取直到收到 `run.completed` 或 `run.failed`。
    /// 返回 `None` 表示 runtime 进程已退出。
    pub async fn read_notification(&mut self) -> Result<Option<Notification>, String> {
        let reader = self.reader.as_mut().ok_or("reader not initialized")?;
        let mut line = String::new();

        match reader.read_line(&mut line).await {
            Ok(0) => Ok(None),   // EOF
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return Ok(None);
                }
                let notif: Notification = serde_json::from_str(trimmed)
                    .map_err(|e| format!("解析通知失败: {} (line: {})", e, trimmed))?;
                Ok(Some(notif))
            }
            Err(e) => Err(format!("读取通知失败: {}", e)),
        }
    }

    /// 关闭 runtime 子进程
    pub async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
        self.spawned = false;
    }
}

impl Drop for StdioClient {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
        }
    }
}
