//! EventBridge — 将 JSON-RPC notification 转换为 SomaUiEvent
//!
//! 双层事件模型：
//!   RuntimeEvent (rust) — 运行时事实（稳定、与 UI 无关）
//!   SomaUiEvent (JSON)  — 桌面端投影（可合并、折叠）
//!
//! 本模块负责投影：从 `task/event` notification 提取 RuntimeEventEnvelope，
//! 投影为 React 可以直接消费的 SomaUiEvent。

use serde::Serialize;
use soma_protocol::command::Notification;

/// 桌面端 UI 事件 — React store 直接消费的类型
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SomaUiEvent {
    AssistantDelta {
        task_id: String,
        text: String,
    },
    ToolStarted {
        task_id: String,
        tool_call_id: String,
        title: String,
    },
    ToolUpdated {
        task_id: String,
        tool_call_id: String,
        output: String,
        truncated: bool,
    },
    ToolCompleted {
        task_id: String,
        tool_call_id: String,
        success: bool,
    },
    ArtifactCreated {
        task_id: String,
        artifact_id: String,
        kind: String,
    },
    WorkStateChanged {
        task_id: String,
        combo: String,
        stage: String,
    },
    TurnStarted {
        task_id: String,
    },
    TurnInterrupted {
        task_id: String,
    },
    TurnCompleted {
        task_id: String,
    },
    Error {
        task_id: String,
        message: String,
    },
}

pub struct EventBridge;

impl EventBridge {
    /// 将 JSON-RPC Notification 投影为 SomaUiEvent（如果适用）
    ///
    /// 只处理 `task/event` 方法。其他 notification 原样传递为 SomaUiEvent::Error。
    pub fn to_ui_event(notif: &Notification) -> Option<SomaUiEvent> {
        if notif.method != "task/event" {
            // 非 task/event notification，保留为原始通知
            return None;
        }

        // 从 params 中解析 RuntimeEventEnvelope 字段
        let kind = notif.params.get("kind")?.as_str()?;
        let task_id = notif.params.get("task_id")?.as_str()?.to_string();
        let payload = notif.params.get("payload")?;

        match kind {
            "TurnStarted" => Some(SomaUiEvent::TurnStarted { task_id }),
            "AssistantDelta" => {
                let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                Some(SomaUiEvent::AssistantDelta { task_id, text })
            }
            "ToolStarted" => {
                let tool_call_id = payload.get("tool_call_id")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let capability_id = payload.get("capability_id")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                Some(SomaUiEvent::ToolStarted {
                    task_id,
                    tool_call_id,
                    title: capability_id,
                })
            }
            "ToolUpdated" => {
                let tool_call_id = payload.get("tool_call_id")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let output = payload.get("output")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let truncated = payload.get("truncated")
                    .and_then(|v| v.as_bool()).unwrap_or(false);
                Some(SomaUiEvent::ToolUpdated {
                    task_id,
                    tool_call_id,
                    output,
                    truncated,
                })
            }
            "ToolCompleted" => {
                let tool_call_id = payload.get("tool_call_id")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let success = payload.get("success")
                    .and_then(|v| v.as_bool()).unwrap_or(false);
                Some(SomaUiEvent::ToolCompleted {
                    task_id,
                    tool_call_id,
                    success,
                })
            }
            "ArtifactCreated" => {
                let artifact_id = payload.get("artifact_id")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let kind = payload.get("kind")
                    .and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                Some(SomaUiEvent::ArtifactCreated {
                    task_id,
                    artifact_id,
                    kind,
                })
            }
            "WorkStateChanged" => {
                let combo = payload.get("combo")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                let stage = payload.get("stage")
                    .and_then(|v| v.as_str()).unwrap_or("").to_string();
                Some(SomaUiEvent::WorkStateChanged {
                    task_id,
                    combo,
                    stage,
                })
            }
            "TurnInterrupted" => Some(SomaUiEvent::TurnInterrupted { task_id }),
            "TurnCompleted" => Some(SomaUiEvent::TurnCompleted { task_id }),
            "TurnFailed" => Some(SomaUiEvent::Error {
                task_id,
                message: payload.get("error")
                    .and_then(|v| v.as_str()).unwrap_or("Turn failed").to_string(),
            }),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_notif(method: &str, params: serde_json::Value) -> Notification {
        Notification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params,
        }
    }

    #[test]
    fn test_non_task_event_returns_none() {
        let notif = make_notif("run.output", serde_json::json!({"text": "hello"}));
        assert!(EventBridge::to_ui_event(&notif).is_none());
    }

    #[test]
    fn test_turn_started() {
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "turn_id": "turn-1",
            "sequence": 0,
            "kind": "TurnStarted",
            "payload": {}
        }));
        let event = EventBridge::to_ui_event(&notif).unwrap();
        match event {
            SomaUiEvent::TurnStarted { task_id } => assert_eq!(task_id, "task-1"),
            _ => panic!("expected TurnStarted"),
        }
    }

    #[test]
    fn test_assistant_delta() {
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "turn_id": "turn-1",
            "sequence": 1,
            "kind": "AssistantDelta",
            "payload": {"text": "Hello world"}
        }));
        let event = EventBridge::to_ui_event(&notif).unwrap();
        match event {
            SomaUiEvent::AssistantDelta { task_id, text } => {
                assert_eq!(task_id, "task-1");
                assert_eq!(text, "Hello world");
            }
            _ => panic!("expected AssistantDelta"),
        }
    }

    #[test]
    fn test_tool_lifecycle() {
        // tool_started
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "turn_id": "turn-1",
            "sequence": 2,
            "kind": "ToolStarted",
            "payload": {
                "tool_call_id": "call-1",
                "capability_id": "file_read",
                "arguments": {"path": "/test.txt"}
            }
        }));
        let event = EventBridge::to_ui_event(&notif).unwrap();
        match &event {
            SomaUiEvent::ToolStarted { task_id, tool_call_id, title } => {
                assert_eq!(task_id, "task-1");
                assert_eq!(tool_call_id, "call-1");
                assert_eq!(title, "file_read");
            }
            _ => panic!("expected ToolStarted, got {:?}", event),
        }

        // tool_completed
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "turn_id": "turn-1",
            "sequence": 3,
            "kind": "ToolCompleted",
            "payload": {
                "tool_call_id": "call-1",
                "success": true,
                "result_summary": "OK"
            }
        }));
        let event = EventBridge::to_ui_event(&notif).unwrap();
        match event {
            SomaUiEvent::ToolCompleted { task_id, tool_call_id, success } => {
                assert_eq!(task_id, "task-1");
                assert_eq!(tool_call_id, "call-1");
                assert!(success);
            }
            _ => panic!("expected ToolCompleted"),
        }
    }

    #[test]
    fn test_work_state_changed() {
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "turn_id": "turn-1",
            "sequence": 4,
            "kind": "WorkStateChanged",
            "payload": {
                "combo": "investigate",
                "stage": "Phase 2"
            }
        }));
        let event = EventBridge::to_ui_event(&notif).unwrap();
        match event {
            SomaUiEvent::WorkStateChanged { task_id, combo, stage } => {
                assert_eq!(task_id, "task-1");
                assert_eq!(combo, "investigate");
                assert_eq!(stage, "Phase 2");
            }
            _ => panic!("expected WorkStateChanged"),
        }
    }

    #[test]
    fn test_unknown_kind_returns_none() {
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "kind": "UnknownKind",
            "payload": {}
        }));
        assert!(EventBridge::to_ui_event(&notif).is_none());
    }

    #[test]
    fn test_missing_kind_returns_none() {
        let notif = make_notif("task/event", serde_json::json!({
            "task_id": "task-1",
            "payload": {}
        }));
        assert!(EventBridge::to_ui_event(&notif).is_none());
    }
}
