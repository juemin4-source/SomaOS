/// SomaOS 运行时事件协议
///
/// 双层事件模型：
///   SomaRuntimeEvent — 运行时事实（稳定、与 UI 无关）
///   EventSink         — 传输无关的事件写入接口
///
/// TurnEngine / Combo / Softill 通过 EventSink 发出事件，
/// 由 JSON-RPC stdio Adapter 序列化为 `task/event` notification。

use serde::{Deserialize, Serialize};

// ── Event Envelope ────────────────────────────────────────────

/// 运行时事件的统一信封
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeEventEnvelope {
    pub schema_version: u32,
    pub task_id: String,
    pub turn_id: String,
    /// 单 Turn 内单调递增
    pub sequence: u64,
    pub kind: RuntimeEventKind,
    pub payload: serde_json::Value,
}

impl RuntimeEventEnvelope {
    pub fn new(task_id: &str, turn_id: &str, sequence: u64, kind: RuntimeEventKind, payload: serde_json::Value) -> Self {
        Self {
            schema_version: 1,
            task_id: task_id.to_string(),
            turn_id: turn_id.to_string(),
            sequence,
            kind,
            payload,
        }
    }
}

// ── 事件类型 ─────────────────────────────────────────────────

/// 运行时事件类型 — 传输无关的稳定事实
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[non_exhaustive]
pub enum RuntimeEventKind {
    /// Turn 开始（生命周期起点）
    TurnStarted,
    /// AI 回复的文字增量
    AssistantDelta,
    /// 工具调用开始
    ToolStarted,
    /// 工具调用输出更新（分块、可截断）
    ToolUpdated,
    /// 工具调用完成
    ToolCompleted,
    /// 产物已创建
    ArtifactCreated,
    /// 工作状态变更
    WorkStateChanged,
    /// 需要用户审批
    ApprovalRequested,
    /// 需要用户决策
    DecisionRequested,
    /// 当前 Turn 被中断
    TurnInterrupted,
    /// 当前 Turn 完成
    TurnCompleted,
    /// 当前 Turn 失败
    TurnFailed,
}

// ── 事件负载类型 ─────────────────────────────────────────────

/// assistant_delta 负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantDeltaPayload {
    pub text: String,
}

/// tool_started 负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolStartedPayload {
    pub tool_call_id: String,
    pub capability_id: String,
    pub arguments: serde_json::Value,
}

/// tool_updated 负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUpdatedPayload {
    pub tool_call_id: String,
    pub output: String,
    /// 是否被截断（超过累计上限）
    #[serde(default)]
    pub truncated: bool,
    /// 完整日志路径（截断时附加）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

/// tool_completed 负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCompletedPayload {
    pub tool_call_id: String,
    pub success: bool,
    pub result_summary: String,
    /// 完整日志路径（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

/// work_state_changed 负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkStateChangedPayload {
    pub combo: String,
    pub stage: String,
}

// ── EventSink Trait ──────────────────────────────────────────

/// 事件写入接口 — 传输无关
///
/// TurnEngine / Combo 通过此 trait 发出运行时事件。
/// 实现者负责将事件序列化并投递到对应传输层（stdio、WebSocket 等）。
pub trait EventSink: Send + Sync {
    /// 发出一个运行时事件
    fn emit(&self, envelope: RuntimeEventEnvelope);

    /// 便捷方法：发送特定类型的事件
    fn emit_event(
        &self,
        task_id: &str,
        turn_id: &str,
        sequence: u64,
        kind: RuntimeEventKind,
        payload: serde_json::Value,
    ) {
        self.emit(RuntimeEventEnvelope::new(task_id, turn_id, sequence, kind, payload));
    }
}

// ── 工具常量 ─────────────────────────────────────────────────

/// tool_updated 单次分块最大字节数
pub const TOOL_UPDATED_CHUNK_MAX: usize = 4096;
/// tool_updated 累计输出上限
pub const TOOL_UPDATED_TOTAL_MAX: usize = 256 * 1024;
/// tool_updated 节流窗口（毫秒）
pub const TOOL_UPDATE_THROTTLE_MS: u64 = 100;

// ── 内存 EventSink（测试用） ─────────────────────────────────

pub struct MemoryEventSink {
    events: std::sync::Mutex<Vec<RuntimeEventEnvelope>>,
}

impl MemoryEventSink {
    pub fn new() -> Self {
        Self {
            events: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub fn take_events(&self) -> Vec<RuntimeEventEnvelope> {
        std::mem::take(&mut self.events.lock().unwrap())
    }

    pub fn events(&self) -> Vec<RuntimeEventEnvelope> {
        self.events.lock().unwrap().clone()
    }
}

impl EventSink for MemoryEventSink {
    fn emit(&self, envelope: RuntimeEventEnvelope) {
        self.events.lock().unwrap().push(envelope);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_envelope_roundtrip() {
        let payload = serde_json::json!({"text": "hello"});
        let env = RuntimeEventEnvelope::new("task-1", "turn-1", 1, RuntimeEventKind::AssistantDelta, payload);
        let json = serde_json::to_string(&env).unwrap();
        let deserialized: RuntimeEventEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.schema_version, 1);
        assert_eq!(deserialized.task_id, "task-1");
        assert_eq!(deserialized.turn_id, "turn-1");
        assert_eq!(deserialized.sequence, 1);
        assert_eq!(deserialized.kind, RuntimeEventKind::AssistantDelta);
    }

    #[test]
    fn test_event_sink_emit() {
        let sink = MemoryEventSink::new();
        sink.emit_event("t1", "t1-1", 0, RuntimeEventKind::TurnStarted, serde_json::json!({}));
        sink.emit_event("t1", "t1-1", 1, RuntimeEventKind::AssistantDelta, serde_json::json!({"text": "hi"}));
        assert_eq!(sink.events().len(), 2);
    }

    #[test]
    fn test_tool_updated_payload_truncated() {
        let p = ToolUpdatedPayload {
            tool_call_id: "call-1".into(),
            output: "test output".into(),
            truncated: true,
            log_path: Some("/tmp/log.txt".into()),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("truncated"));
        assert!(json.contains("log_path"));
    }

    #[test]
    fn test_tool_started_payload_serialize() {
        let p = ToolStartedPayload {
            tool_call_id: "call-1".into(),
            capability_id: "file.read".into(),
            arguments: serde_json::json!({"path": "/tmp/test.txt"}),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("file.read"));
        assert!(json.contains("/tmp/test.txt"));
    }

    #[test]
    fn test_memory_sink_is_send_sync() {
        // 编译期验证：MemoryEventSink 实现了 Send + Sync
        fn check_send<T: Send + Sync>() {}
        check_send::<MemoryEventSink>();
    }

    #[test]
    fn test_envelope_sequence_ordering() {
        let sink = MemoryEventSink::new();
        for i in 0..5 {
            sink.emit_event("t1", "t1-1", i, RuntimeEventKind::AssistantDelta, serde_json::json!({"text": format!("chunk {}", i)}));
        }
        let events = sink.events();
        for (i, e) in events.iter().enumerate() {
            assert_eq!(e.sequence as usize, i);
        }
    }

    #[test]
    fn test_work_state_changed_payload() {
        let p = WorkStateChangedPayload {
            combo: "investigate".into(),
            stage: "Phase 3: Hypothesis Testing".into(),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("investigate"));
    }
}
