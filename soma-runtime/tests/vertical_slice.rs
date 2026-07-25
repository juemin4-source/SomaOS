// 垂直切片集成测试
//
// 场景：task/create → task/send_message → AI 执行 → task/event 流 → task/get 验证
//
// 启动 soma-runtime 子进程，通过 stdin/stdout JSON-RPC 驱动全流程。
// 验证事件通知通道和任务状态转换。

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// 清理测试数据库，保证每次测试从干净状态开始
fn clean_test_db() {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join(".somaos");
    // 多次尝试以应对锁竞争
    for _ in 0..5 {
        if std::fs::remove_dir_all(&base).is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let _ = std::fs::create_dir_all(&base);
}


/// 确保子进程在测试结束或 panic 时被清理
struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// 查找 soma-runtime 二进制路径
fn runtime_binary() -> String {
    // cargo test 设置了 CARGO_BIN_EXE_<name>
    if let Ok(path) = std::env::var("CARGO_BIN_EXE_soma-runtime") {
        return path;
    }
    // 回退：在 target 中查找
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .unwrap_or_else(|_| {
            let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
            let path = std::path::Path::new(&manifest).join("..").join("target");
            path.to_string_lossy().to_string()
        });

    let binary = if cfg!(windows) { "soma-runtime.exe" } else { "soma-runtime" };
    for profile in &["debug", "release"] {
        let path = std::path::Path::new(&target_dir).join(profile).join(binary);
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
    }
    panic!("soma-runtime binary not found. Build first: cargo build -p soma-runtime");
}

/// 启动 runtime 子进程，返回 (stdin, stdout_reader, child_guard)
fn start_runtime() -> (Box<dyn Write + Send>, BufReader<Box<dyn Read + Send>>, ChildGuard) {
    let binary = runtime_binary();
    let mut child = Command::new(&binary)
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to start soma-runtime");

    let stdin = child.stdin.take().expect("no stdin");
    let stdout = child.stdout.take().expect("no stdout");

    (Box::new(stdin), BufReader::new(Box::new(stdout)), ChildGuard(child))
}

/// 发送 JSON-RPC 请求并等待响应（跳过中间的通知）
fn send_request(
    stdin: &mut (impl Write + Send),
    stdout: &mut BufReader<Box<dyn Read + Send>>,
    id: u64,
    method: &str,
    params: &str,
) -> serde_json::Value {
    let request = format!(r#"{{"jsonrpc":"2.0","id":{},"method":"{}","params":{}}}"#, id, method, params);
    writeln!(stdin, "{}", request).expect("write stdin failed");
    stdin.flush().expect("flush stdin failed");

    // 逐行读取，跳过通知（无 id 字段的 JSON），直到找到匹配 id 的响应
    loop {
        let mut line = String::new();
        stdout.read_line(&mut line).expect("read stdout failed");
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let val: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };
        // 检查是否有 id 字段且匹配
        if let Some(resp_id) = val.get("id").and_then(|v| v.as_u64()) {
            if resp_id == id {
                return val;
            }
        }
        // 否则是通知，继续读
    }
}

/// 读取下一条通知（带超时）
fn read_notification(
    stdout: &mut BufReader<Box<dyn Read + Send>>,
    timeout: Duration,
) -> Option<serde_json::Value> {
    let start = Instant::now();
    let mut line = String::new();

    loop {
        if start.elapsed() > timeout {
            return None;
        }

        // 尝试非阻塞读取
        line.clear();
        match stdout.read_line(&mut line) {
            Ok(0) => return None, // EOF
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str(trimmed) {
                    Ok(val) => return Some(val),
                    Err(_) => continue,
                }
            }
            Err(_) => return None,
        }
    }
}

// ──────────────────────────────────────────
// 测试
// ──────────────────────────────────────────

#[test]
fn test_vertical_slice_task_flow() {
    clean_test_db();
    let (mut stdin, mut stdout, _guard) = start_runtime();

    // 1. 创建任务
    let resp = send_request(&mut stdin, &mut stdout, 1, "task/create", r#"{"project_root":".","title":"切片测试"}"#);
    let task_id = resp["result"]["task_id"].as_str().unwrap_or("?").to_string();
    assert!(task_id.starts_with("task-"), "task/create should return task-N, got: {}", task_id);
    eprintln!("1/5 task/create ✅ (id={})", task_id);

    // 2. 列出任务
    let resp = send_request(&mut stdin, &mut stdout, 2, "task/list", r#"{}"#);
    let tasks = resp["result"]["tasks"].as_array().expect("tasks should be array");
    assert!(tasks.len() >= 1, "should have at least 1 task, got {}", tasks.len());
    assert_eq!(tasks[0]["title"], "切片测试");
    eprintln!("2/5 task/list ✅");

    // 3. 发送消息（触发 AI，如果 API key 没有，应该返回 TurnFailed）
    let msg_payload = format!(r#"{{"task_id":"{}","text":"列出当前目录"}}"#, task_id);
    let resp = send_request(&mut stdin, &mut stdout, 3, "task/send_message", &msg_payload);
    assert!(resp["result"]["accepted"].as_bool().unwrap_or(false), "send_message should be accepted");
    let turn_id = resp["result"]["turn_id"].as_str().unwrap_or("").to_string();
    eprintln!("3/5 task/send_message ✅ (turn={})", turn_id);

    // 4. 读取流式事件
    let mut events = Vec::new();
    let mut turn_completed = false;
    let deadline = Duration::from_secs(15); // AI 有 15 秒响应

    while !turn_completed {
        match read_notification(&mut stdout, deadline) {
            Some(notif) => {
                let method = notif["method"].as_str().unwrap_or("").to_string();
                if method == "task/event" {
                    if let Some(kind) = notif["params"]["kind"].as_str() {
                        events.push(kind.to_string());
                        eprintln!("  event[{}]: {}", events.len(), kind);
                        if kind == "TurnCompleted" || kind == "TurnFailed" {
                            turn_completed = true;
                        }
                    }
                }
            }
            None => {
                eprintln!("  ⚠️  timeout waiting for events, got {} so far", events.len());
                break;
            }
        }
    }

    assert!(events.len() >= 1, "should receive at least 1 event");
    let last_event = events.last().cloned().unwrap_or_default();
    assert!(
        last_event == "TurnCompleted" || last_event == "TurnFailed",
        "last event should be TurnCompleted or TurnFailed, got: {}",
        last_event
    );
    eprintln!("4/5 events ✅ ({} events, last={})", events.len(), last_event);

    // 5. 验证任务状态
    let get_payload = format!(r#"{{"task_id":"{}"}}"#, task_id);
    let resp = send_request(&mut stdin, &mut stdout, 4, "task/get", &get_payload);
    let status = resp["result"]["status"].as_str().unwrap_or("").to_string();
    eprintln!("5/5 task/get: status={}", status);

    // TurnCompleted → task 应为 completed, TurnFailed → task 应为 idle（可重试）
    if last_event == "TurnCompleted" {
        assert_eq!(status, "completed", "task should be completed after TurnCompleted");
    } else {
        assert_eq!(status, "idle", "task should be idle (retryable) after TurnFailed");
    }
    eprintln!("5/5 task/get ✅ (status={})", status);

    eprintln!();
    eprintln!("═══════════════════════════════════════");
    eprintln!("  VERTICAL SLICE PASSED");
    eprintln!("  Events: {}", events.join(" → "));
    eprintln!("═══════════════════════════════════════");
}

#[test]
fn test_vertical_slice_cancel() {
    let (mut stdin, mut stdout, _guard) = start_runtime();

    // 创建任务
    send_request(&mut stdin, &mut stdout, 1, "task/create", r#"{"project_root":".","title":"取消测试"}"#);

    // 发送消息
    let resp = send_request(&mut stdin, &mut stdout, 2, "task/send_message", r#"{"task_id":"task-1","text":"ping"}"#);
    assert!(resp["result"]["accepted"].as_bool().unwrap_or(false));

    // 取消
    let resp = send_request(&mut stdin, &mut stdout, 3, "task/cancel", r#"{"task_id":"task-1"}"#);
    assert!(resp["result"]["cancelled"].as_bool().unwrap_or(false));

    // 验证——cancel_turn 将任务设为 interrupted，
    // 但后台 run_task_turn 检测到中断后会调 fail_turn 重置为 idle
    let resp = send_request(&mut stdin, &mut stdout, 4, "task/get", r#"{"task_id":"task-1"}"#);
    let status = resp["result"]["status"].as_str().unwrap_or("");
    assert!(status == "interrupted" || status == "idle",
        "unexpected cancel status: {}", status);

    eprintln!("Cancel test ✅ (status={})", status);
}
