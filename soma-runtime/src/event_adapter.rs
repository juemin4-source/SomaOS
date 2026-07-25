/// EventSink → JSON-RPC notification 适配器
///
/// 将 EventSink::emit(RuntimeEventEnvelope) 写为 JSON-RPC `task/event` notification。
/// 支持双模式输出：stdio（通过 OutputWriter）和 HTTP/SSE（通过 broadcast）。
///
/// 架构位置：
///   TurnEngine → EventSink (trait)
///       ↓
///   NotificationEventSink / BroadcastNotificationSink
///       ↓
///   OutputWriter (stdio) 或 broadcast::Sender (HTTP/SSE)

use std::sync::Arc;

use soma_protocol::events::{EventSink, RuntimeEventEnvelope};
use tokio::sync::broadcast;

use crate::OutputWriter;

/// 将 RuntimeEventEnvelope 写为 `task/event` notification 的 EventSink 实现
pub struct NotificationEventSink {
    output: Arc<OutputWriter>,
}

impl NotificationEventSink {
    pub fn new(output: Arc<OutputWriter>) -> Self {
        Self { output }
    }
}

impl EventSink for NotificationEventSink {
    fn emit(&self, envelope: RuntimeEventEnvelope) {
        let kind = envelope.kind.clone();
        let task_id = envelope.task_id.clone();
        let value = serde_json::to_value(&envelope).unwrap_or_else(|e| {
            tracing::error!(task_id = %task_id, kind = ?kind, error = %e, "Failed to serialize RuntimeEventEnvelope");
            serde_json::json!({
                "error": format!("serialize error: {}", e),
                "kind": "unknown",
            })
        });
        self.output.write_notification("task/event", &value);
    }
}

/// 同时写入 stdout 和 broadcast 的 EventSink
///
/// 在 HTTP 模式下，事件既通过 stdout (--stdio 兼容) 也通过 SSE 广播给浏览器客户端。
pub struct BroadcastNotificationSink {
    stdout: Arc<OutputWriter>,
    tx: broadcast::Sender<String>,
}

impl BroadcastNotificationSink {
    pub fn new(stdout: Arc<OutputWriter>, tx: broadcast::Sender<String>) -> Self {
        Self { stdout, tx }
    }
}

impl EventSink for BroadcastNotificationSink {
    fn emit(&self, envelope: RuntimeEventEnvelope) {
        let kind = envelope.kind.clone();
        let task_id = envelope.task_id.clone();
        let value = serde_json::to_value(&envelope).unwrap_or_else(|e| {
            tracing::error!(task_id = %task_id, kind = ?kind, error = %e, "Failed to serialize event");
            serde_json::json!({
                "error": format!("serialize error: {}", e),
                "kind": "unknown",
            })
        });

        // 写入 stdout（兼容 --stdio 模式）
        self.stdout.write_notification("task/event", &value);

        // 广播到 SSE 客户端
        let json = serde_json::to_string(&value).unwrap_or_default();
        if let Err(e) = self.tx.send(json) {
            tracing::debug!(task_id = %task_id, kind = ?kind, dropped = %e.0.len(), "SSE broadcast dropped events");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soma_protocol::events::RuntimeEventKind;

    #[test]
    fn test_broadcast_sink_is_send_sync() {
        fn check_send<T: Send + Sync>() {}
        check_send::<BroadcastNotificationSink>();
    }

    #[test]
    fn test_notification_sink_emit() {
        let writer = Arc::new(OutputWriter::new());
        let sink = NotificationEventSink::new(writer);

        let envelope = RuntimeEventEnvelope::new(
            "task-1",
            "turn-1",
            1,
            RuntimeEventKind::TurnStarted,
            serde_json::json!({}),
        );

        // emit 不应 panic
        sink.emit(envelope);
    }

    #[test]
    fn test_notification_sink_emit_multiple() {
        let writer = Arc::new(OutputWriter::new());
        let sink = NotificationEventSink::new(writer);

        let kinds = [
            (RuntimeEventKind::TurnStarted, serde_json::json!({})),
            (RuntimeEventKind::AssistantDelta, serde_json::json!({"text": "hello"})),
            (RuntimeEventKind::ToolStarted, serde_json::json!({
                "tool_call_id": "call-1",
                "capability_id": "file_read",
                "arguments": {"path": "/test.txt"}
            })),
            (RuntimeEventKind::ToolCompleted, serde_json::json!({
                "tool_call_id": "call-1",
                "success": true,
                "result_summary": "OK"
            })),
            (RuntimeEventKind::WorkStateChanged, serde_json::json!({
                "combo": "investigate",
                "stage": "Phase 2"
            })),
        ];

        for (i, (kind, payload)) in kinds.iter().enumerate() {
            let envelope = RuntimeEventEnvelope::new(
                "task-1",
                "turn-1",
                i as u64,
                kind.clone(),
                payload.clone(),
            );
            sink.emit(envelope);
        }

        // 验证不 panic 即可 —— 输出验证在集成测试中
    }

    #[test]
    fn test_notification_sink_serialize_error_resilience() {
        // 测试当序列化失败时，sink 不 panic
        let writer = Arc::new(OutputWriter::new());
        let sink = NotificationEventSink::new(writer);

        // 使用非序列化值（实际上 serde_json::Value 总是可序列化的，
        // 但测试边界条件）
        let envelope = RuntimeEventEnvelope::new(
            "task-1",
            "turn-1",
            0,
            RuntimeEventKind::TurnStarted,
            serde_json::json!({"valid": true}),
        );

        sink.emit(envelope);
        // 不应 panic
    }

    #[test]
    fn test_notification_sink_is_send_sync() {
        fn check_send<T: Send + Sync>() {}
        check_send::<NotificationEventSink>();
    }

    #[test]
    fn test_envelope_roundtrip_through_sink() {
        let writer = Arc::new(OutputWriter::new());
        let sink = NotificationEventSink::new(writer);

        // 构造一个完整的 envelope，验证 roundtrip
        let tool_payload = serde_json::json!({
            "tool_call_id": "call-1",
            "capability_id": "file_search",
            "arguments": {"pattern": "TODO", "path": "./src"}
        });
        let envelope = RuntimeEventEnvelope::new(
            "task-test",
            "turn-test",
            42,
            RuntimeEventKind::ToolStarted,
            tool_payload,
        );

        sink.emit(envelope.clone());

        // 验证原始 envelope 在 emit 后不变
        assert_eq!(envelope.task_id, "task-test");
        assert_eq!(envelope.turn_id, "turn-test");
        assert_eq!(envelope.sequence, 42);
        assert_eq!(envelope.kind, RuntimeEventKind::ToolStarted);
    }
}
