//! commands — Tauri invoke 命令
//!
//! 这些是 React 前端通过 `invoke()` 调用的 Rust 函数。
//! 每个命令调用 RuntimeManager 发送 JSON-RPC 请求到 soma-runtime。

use std::sync::Arc;
use tokio::sync::Mutex;

use tauri::State;

use crate::runtime_manager::RuntimeManager;

/// 任务摘要 — 给前端列表用
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 任务详情 — 给前端详情页用
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDetail {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub project_root: String,
    pub work_state: serde_json::Value,
    pub artifacts: Vec<serde_json::Value>,
}

/// 发送消息结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResult {
    pub task_id: String,
    pub turn_id: String,
    pub accepted: bool,
}

/// 创建新任务
#[tauri::command]
pub async fn create_task(
    runtime: State<'_, Arc<Mutex<RuntimeManager>>>,
    project_root: String,
    title: String,
) -> Result<TaskSummary, String> {
    let mut rt = runtime.lock().await;
    let result = rt
        .send_request(
            "task/create",
            serde_json::json!({
                "project_root": project_root,
                "title": title,
            }),
        )
        .await?;

    let task_id = result.get("task_id")
        .and_then(|v| v.as_str())
        .ok_or("missing task_id in response")?;

    // 创建后立即查询详情以获取完整信息
    let detail = rt
        .send_request(
            "task/get",
            serde_json::json!({ "task_id": task_id }),
        )
        .await?;

    Ok(TaskSummary {
        id: detail.get("id").and_then(|v| v.as_str()).unwrap_or(task_id).to_string(),
        title: detail.get("title").and_then(|v| v.as_str()).unwrap_or(&title).to_string(),
        status: detail.get("status").and_then(|v| v.as_str()).unwrap_or("idle").to_string(),
        created_at: detail.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        updated_at: detail.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
    })
}

/// 列出所有任务
#[tauri::command]
pub async fn list_tasks(
    runtime: State<'_, Arc<Mutex<RuntimeManager>>>,
) -> Result<Vec<TaskSummary>, String> {
    let mut rt = runtime.lock().await;
    let result = rt.send_request("task/list", serde_json::json!({})).await?;

    let tasks = result.get("tasks")
        .and_then(|v| v.as_array())
        .ok_or("missing tasks array")?;

    let summaries: Vec<TaskSummary> = tasks
        .iter()
        .map(|t| TaskSummary {
            id: t.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            title: t.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            status: t.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            created_at: t.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            updated_at: t.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
        .collect();

    Ok(summaries)
}

/// 获取任务详情
#[tauri::command]
pub async fn get_task(
    runtime: State<'_, Arc<Mutex<RuntimeManager>>>,
    task_id: String,
) -> Result<TaskDetail, String> {
    let mut rt = runtime.lock().await;
    let result = rt
        .send_request("task/get", serde_json::json!({ "task_id": task_id }))
        .await?;

    Ok(TaskDetail {
        id: result.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        title: result.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        status: result.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        created_at: result.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        updated_at: result.get("updated_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        project_root: result.get("project_root").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        work_state: result.get("work_state").cloned().unwrap_or(serde_json::json!({})),
        artifacts: result.get("artifacts").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
    })
}

/// 发送消息（启动一个新的 Turn）
#[tauri::command]
pub async fn send_message(
    runtime: State<'_, Arc<Mutex<RuntimeManager>>>,
    task_id: String,
    text: String,
) -> Result<SendMessageResult, String> {
    let mut rt = runtime.lock().await;
    let result = rt
        .send_request(
            "task/send_message",
            serde_json::json!({
                "task_id": task_id,
                "text": text,
            }),
        )
        .await?;

    Ok(SendMessageResult {
        task_id: result.get("task_id").and_then(|v| v.as_str()).unwrap_or(&task_id).to_string(),
        turn_id: result.get("turn_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        accepted: result.get("accepted").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

/// 取消当前 Turn
#[tauri::command]
pub async fn cancel_turn(
    runtime: State<'_, Arc<Mutex<RuntimeManager>>>,
    task_id: String,
) -> Result<bool, String> {
    let mut rt = runtime.lock().await;
    let result = rt
        .send_request("task/cancel", serde_json::json!({ "task_id": task_id }))
        .await?;

    Ok(result.get("cancelled").and_then(|v| v.as_bool()).unwrap_or(false))
}
