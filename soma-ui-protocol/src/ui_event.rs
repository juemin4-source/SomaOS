//! # UiEvent —— 结构化 UI 事件类型
//!
//! 每个事件携带 TUI 渲染所需的全部结构信息。
//! 事件按序列号单调递增，TUI 按序处理。

use serde::{Deserialize, Serialize};

// ── UiEvent 信封 ─────────────────────────────────────────────────

/// 一条 UI 事件的全部信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiEvent {
    /// 所属 task
    pub task_id: String,
    /// 所属 turn
    pub turn_id: String,
    /// 单调递增序号（跨 turn 也递增，便于 TUI 排序）
    pub sequence: u64,
    /// 事件体
    pub kind: UiEventKind,
}

// ── 事件种类 ─────────────────────────────────────────────────────

/// UI 事件种类 —— TUI 只需匹配投影
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum UiEventKind {
    // ── 生命周期 ──

    /// 一个 Turn 开始。TUI 应创建新的活跃 cell。
    TurnStarted,

    /// 一个 Turn 正常结束。当前活跃 cell 转为已提交。
    TurnCompleted,

    /// 一个 Turn 被用户中断。当前活跃 cell 标记为中断。
    TurnInterrupted,

    /// 一个 Turn 因错误结束。
    TurnFailed { error: String },

    // ── 文字显示 ──

    /// AI 回复的流式文本增量（newline-gated）。
    ///
    /// TUI 行为：
    /// - 累积 `text` 到当前 streaming buffer
    /// - 如果 `newline_count > 0`，将完成的行推入显示 cell
    /// - `is_final: true` 时，将剩余 buffer 以完整 cell 提交
    StreamChunk {
        /// 增量文本（可能跨多行）
        text: String,
        /// 此次增量包含的完整行数（以 \n 结尾）
        newline_count: u32,
        /// 是否为此事件的最后一个 chunk（stream 结束）
        is_final: bool,
    },

    /// 一段完整的已提交内容（不流式）。
    ///
    /// 用于历史回放、系统消息等场景。
    DisplayCell {
        /// cell 类型
        cell_type: DisplayCellType,
        /// 渲染就绪的内容（markdown 文本）
        content: String,
    },

    // ── 工具调用 ──

    /// 一次工具调用开始。
    ToolCallStarted {
        call_id: String,
        /// 能力名称（如 `file_read`、`code_search`）
        capability: String,
        /// 参数（JSON，已序列化为显示友好的结构）
        args_display: String,
    },

    /// 工具调用输出流（stdout/stderr 增量）。
    ToolCallOutput {
        call_id: String,
        /// 输出增量（可能被截断）
        output: String,
        /// 是否已被截断（超出累计上限）
        truncated: bool,
    },

    /// 工具调用完成。
    ToolCallCompleted {
        call_id: String,
        /// 退出码
        exit_code: i32,
        /// 结果摘要（简短）
        summary: String,
        /// 完整日志路径（如果有）
        log_path: Option<String>,
    },

    // ── 工作流 ──

    /// 工作状态变更（combo stage 等）
    WorkStateChanged {
        /// combo/workflow 名称
        combo: String,
        /// 当前阶段
        stage: String,
    },

    /// 产物已创建（文件、截图等）
    ArtifactCreated {
        /// 文件路径
        path: String,
        /// 产物描述
        summary: String,
    },

    /// Diff 内容就绪（来自 git_diff 等工具）
    DiffAvailable {
        /// diff 文本（unified diff 格式）
        diff_text: String,
        /// 文件路径（可选）
        file_path: Option<String>,
    },

    // ── 用户交互 ──

    /// 需要用户审批一个操作。
    ApprovalRequired {
        /// 审批请求 ID（后续 `ApprovalResult` 携带）
        approval_id: String,
        /// 向用户展示的审批说明
        prompt: String,
        /// 超时（毫秒），None 表示不超时
        timeout_ms: Option<u64>,
    },

    /// 需要用户输入文字。
    UserInputRequired {
        /// 输入请求 ID
        input_id: String,
        /// 提示文字
        prompt: String,
        /// 默认值（可选）
        default: Option<String>,
    },

    // ── 系统 ──

    /// 系统级消息（错误、警告、信息）
    SystemMessage {
        /// 级别：error / warn / info / debug
        level: String,
        /// 消息内容
        text: String,
    },
}

/// 已提交 cell 的类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DisplayCellType {
    /// 用户消息
    UserMessage,
    /// AI 回复（markdown 全文）
    AssistantMessage,
    /// 系统通知
    SystemNotification,
    /// 错误信息
    ErrorMessage,
}

// ── TUI 发送给 Runtime 的 UI 事件 ───────────────────────────────

/// TUI 发给 Runtime 的用户操作事件（串行在标准输入上）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum UiCommand {
    /// 用户提交了输入
    SubmitInput {
        /// 输入请求 ID（匹配 `UserInputRequired.input_id`）
        input_id: String,
        /// 用户输入的文字
        text: String,
    },
    /// 用户批准了操作
    Approve {
        /// 审批请求 ID（匹配 `ApprovalRequired.approval_id`）
        approval_id: String,
    },
    /// 用户拒绝了操作
    Reject {
        /// 审批请求 ID（匹配 `ApprovalRequired.approval_id`）
        approval_id: String,
    },
    /// 用户请求中断当前 Turn
    Cancel,
    /// 用户请求退出
    Quit,
}

// ── 便捷构造 ──

impl UiEvent {
    pub fn new(task_id: &str, turn_id: &str, sequence: u64, kind: UiEventKind) -> Self {
        Self {
            task_id: task_id.to_string(),
            turn_id: turn_id.to_string(),
            sequence,
            kind,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_event_roundtrip() {
        let e = UiEvent::new("t1", "t1-1", 0, UiEventKind::TurnStarted);
        let json = serde_json::to_string(&e).unwrap();
        let back: UiEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back.task_id, "t1");
        assert_eq!(back.sequence, 0);
    }

    #[test]
    fn test_stream_chunk_roundtrip() {
        let e = UiEvent::new(
            "t1", "t1-1", 1,
            UiEventKind::StreamChunk {
                text: "hello\nworld".into(),
                newline_count: 1,
                is_final: false,
            },
        );
        let json = serde_json::to_string(&e).unwrap();
        let back: UiEvent = serde_json::from_str(&json).unwrap();
        match back.kind {
            UiEventKind::StreamChunk { text, newline_count, is_final } => {
                assert_eq!(text, "hello\nworld");
                assert_eq!(newline_count, 1);
                assert!(!is_final);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_tool_call_lifecycle() {
        let events = vec![
            UiEvent::new("t1", "t1-1", 10, UiEventKind::ToolCallStarted {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{ \"path\": \"/tmp/test.txt\" }".into(),
            }),
            UiEvent::new("t1", "t1-1", 11, UiEventKind::ToolCallOutput {
                call_id: "call-1".into(),
                output: "file content".into(),
                truncated: false,
            }),
            UiEvent::new("t1", "t1-1", 12, UiEventKind::ToolCallCompleted {
                call_id: "call-1".into(),
                exit_code: 0,
                summary: "OK".into(),
                log_path: None,
            }),
        ];

        let json = serde_json::to_string(&events).unwrap();
        let back: Vec<UiEvent> = serde_json::from_str(&json).unwrap();
        assert_eq!(back.len(), 3);
    }

    #[test]
    fn test_display_cell_roundtrip() {
        let e = UiEvent::new("t1", "t1-1", 5, UiEventKind::DisplayCell {
            cell_type: DisplayCellType::AssistantMessage,
            content: "# Hello\n\nThis is markdown.".into(),
        });
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("AssistantMessage"));
    }

    #[test]
    fn test_ui_command_roundtrip() {
        let cmd = UiCommand::SubmitInput {
            input_id: "input-1".into(),
            text: "fix the bug".into(),
        };
        let json = serde_json::to_string(&cmd).unwrap();
        let back: UiCommand = serde_json::from_str(&json).unwrap();
        match back {
            UiCommand::SubmitInput { input_id, text } => {
                assert_eq!(input_id, "input-1");
                assert_eq!(text, "fix the bug");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn test_envelope_sorted_by_sequence() {
        let mut events: Vec<UiEvent> = (0..10)
            .map(|i| UiEvent::new("t1", "t1-1", i, UiEventKind::SystemMessage {
                level: "info".into(),
                text: format!("event {}", i),
            }))
            .collect();
        events.reverse();
        events.sort_by_key(|e| e.sequence);
        for (i, e) in events.iter().enumerate() {
            assert_eq!(e.sequence as usize, i);
        }
    }
}
