//! # CellBuffer —— TUI 的 cell 状态缓冲区
//!
//! 将 `UiEvent` 流归约为一系列离散 cell。每个 cell 代表一段可渲染内容：
//! 用户消息、AI 回复块、工具调用、系统消息等。
//!
//! 模式源自 Codex TUI 的 `transcript_cells: Vec<Arc<dyn HistoryCell>>`，
//! 但这里只定义数据模型，不带渲染逻辑。TUI 负责将这些 cell 投影到视口。

use serde::{Deserialize, Serialize};

/// 缓冲区中一个 cell 的当前状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CellState {
    /// 正在流式输出中（可追加内容）
    Active,
    /// 已被用户中断
    Interrupted,
    /// 已完成，不可再追加
    Committed,
    /// 因错误终止
    Failed,
}

/// Cell 类型 —— 决定 TUI 如何渲染
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CellKind {
    /// 用户消息
    UserMessage {
        /// 消息内容
        text: String,
    },
    /// AI 回复（markdown 文本）
    AssistantMessage {
        /// 已完成的行（不含正在流式的尾巴）
        committed_text: String,
        /// 当前未完成行（流式 buffer）
        pending_text: String,
    },
    /// 一次工具调用
    ToolCall {
        call_id: String,
        capability: String,
        args_display: String,
        /// 工具输出（可能被截断）
        output: String,
        /// 是否已被截断
        truncated: bool,
        /// 退出码（None 表示仍在运行）
        exit_code: Option<i32>,
        /// 结果摘要
        summary: Option<String>,
        log_path: Option<String>,
    },
    /// 系统消息
    SystemMessage {
        level: String,
        text: String,
    },
    /// 工作状态变更
    WorkState {
        combo: String,
        stage: String,
    },
    /// 产物已创建
    Artifact {
        path: String,
        summary: String,
    },
    /// Diff 内容（unified diff 格式）
    Diff {
        diff_text: String,
        file_path: Option<String>,
    },
    /// 审批请求
    ApprovalRequest {
        approval_id: String,
        prompt: String,
    },
    /// 用户输入请求
    UserInputRequest {
        input_id: String,
        prompt: String,
    },
}

impl CellKind {
    pub fn is_active(&self) -> bool {
        matches!(self, CellKind::AssistantMessage { .. } | CellKind::ToolCall { exit_code: None, .. })
    }
}

/// 缓冲区中的一个 cell
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub kind: CellKind,
    pub state: CellState,
    pub task_id: String,
    pub turn_id: String,
    /// 创建时的序列号
    pub created_at: u64,
}

/// 按序管理 cell 的缓冲区
///
/// TUI 持有此缓冲区的单一实例，每次收到 `UiEvent` 后调用 `apply()` 更新它，
/// 然后从 `cells()` 读取当前所有 cell 并渲染。
///
/// # 与 Codex TUI 的对比
///
/// Codex TUI 的 `transcript_cells: Vec<Arc<dyn HistoryCell>>` 是 trait object 集合，
/// 每个 cell 自包含渲染逻辑（`display_lines()`）。这里的 `CellBuffer` 是纯数据模型，
/// 渲染逻辑分离到 TUI 侧 —— 这符合「只投影」原则。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellBuffer {
    cells: Vec<Cell>,
    /// 当前活跃的 tool call（用于追加 output）
    active_tool_index: Option<usize>,
}

impl CellBuffer {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            cells: Vec::new(),
            active_tool_index: None,
        }
    }

    /// 返回所有 cell 的引用
    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }

    /// 添加一个新 cell
    pub fn push_cell(&mut self, cell: Cell) {
        if matches!(cell.kind, CellKind::ToolCall { .. }) {
            self.active_tool_index = Some(self.cells.len());
        }
        self.cells.push(cell);
    }

    /// 返回最后一个活跃的 assistant cell 的可变引用（用于追加流式文本）
    pub fn active_assistant_mut(&mut self) -> Option<&mut Cell> {
        self.cells.iter_mut().rev().find(|c| {
            matches!(c.kind, CellKind::AssistantMessage { .. }) && c.state == CellState::Active
        })
    }

    /// 为活跃的 tool call 追加输出
    pub fn append_tool_output(&mut self, _call_id: &str, output: &str) -> bool {
        if let Some(idx) = self.active_tool_index {
            if idx < self.cells.len() {
                if let CellKind::ToolCall { output: out, .. } = &mut self.cells[idx].kind {
                    out.push_str(output);
                    return true;
                }
            }
        }
        false
    }

    /// 完成活跃的 tool call
    pub fn complete_active_tool(&mut self, code: i32, sum: String, log: Option<String>) -> bool {
        if let Some(idx) = self.active_tool_index {
            if idx < self.cells.len() {
                if let CellKind::ToolCall { ref mut exit_code, ref mut summary, ref mut log_path, .. } = &mut self.cells[idx].kind {
                    *exit_code = Some(code);
                    *summary = Some(sum);
                    *log_path = log;
                }
                self.cells[idx].state = CellState::Committed;
                self.active_tool_index = None;
                return true;
            }
        }
        false
    }

    /// 提交所有活跃 cell
    pub fn commit_all_active(&mut self) {
        for cell in self.cells.iter_mut() {
            if cell.state == CellState::Active {
                cell.state = CellState::Committed;
            }
        }
        self.active_tool_index = None;
    }

    /// 标记所有活跃 cell 为 Interrupted
    pub fn interrupt_all_active(&mut self) {
        for cell in self.cells.iter_mut() {
            if cell.state == CellState::Active {
                cell.state = CellState::Interrupted;
            }
        }
        self.active_tool_index = None;
    }

    /// 标记所有活跃 cell 为 Failed
    pub fn fail_all_active(&mut self) {
        for cell in self.cells.iter_mut() {
            if cell.state == CellState::Active {
                cell.state = CellState::Failed;
            }
        }
        self.active_tool_index = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_buffer() {
        let buf = CellBuffer::new();
        assert!(buf.cells().is_empty());
    }

    #[test]
    fn test_stream_chunk_appends_to_active_assistant() {
        let mut buf = CellBuffer::new();

        // 模拟 TurnStarted + StreamChunk 效果
        buf.cells.push(Cell {
            kind: CellKind::AssistantMessage {
                committed_text: String::new(),
                pending_text: String::new(),
            },
            state: CellState::Active,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 1,
        });

        // 模拟累积 chunk
        if let Some(cell) = buf.active_assistant_mut() {
            if let CellKind::AssistantMessage { committed_text, pending_text } = &mut cell.kind {
                // 新行完成
                pending_text.push_str("hello\n");
                committed_text.push_str(pending_text.as_str());
                pending_text.clear();
            }
        }

        if let Some(cell) = buf.active_assistant_mut() {
            if let CellKind::AssistantMessage { committed_text, pending_text } = &mut cell.kind {
                pending_text.push_str("world"); // 未完成行
            }
        }

        assert_eq!(buf.cells.len(), 1);
        if let CellKind::AssistantMessage { committed_text, pending_text } = &buf.cells[0].kind {
            assert_eq!(committed_text, "hello\n");
            assert_eq!(pending_text, "world");
        }
    }

    #[test]
    fn test_commit_and_interrupt() {
        let mut buf = CellBuffer::new();
        buf.cells.push(Cell {
            kind: CellKind::AssistantMessage {
                committed_text: "done".into(),
                pending_text: String::new(),
            },
            state: CellState::Active,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 1,
        });

        buf.commit_all_active();
        assert_eq!(buf.cells[0].state, CellState::Committed);

        buf.cells.push(Cell {
            kind: CellKind::ToolCall {
                call_id: "call-1".into(),
                capability: "test".into(),
                args_display: "{}".into(),
                output: String::new(),
                truncated: false,
                exit_code: None,
                summary: None,
                log_path: None,
            },
            state: CellState::Active,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 2,
        });

        buf.interrupt_all_active();
        assert_eq!(buf.cells[0].state, CellState::Committed);
        assert_eq!(buf.cells[1].state, CellState::Interrupted);
    }

    #[test]
    fn test_tool_call_append_output() {
        let mut buf = CellBuffer::new();
        buf.cells.push(Cell {
            kind: CellKind::ToolCall {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{}".into(),
                output: String::new(),
                truncated: false,
                exit_code: None,
                summary: None,
                log_path: None,
            },
            state: CellState::Active,
            task_id: "t1".into(),
            turn_id: "t1-1".into(),
            created_at: 2,
        });
        buf.active_tool_index = Some(0);

        // 追加输出
        let idx = buf.active_tool_index.unwrap();
        if let CellKind::ToolCall { output, .. } = &mut buf.cells[idx].kind {
            output.push_str("line 1\nline 2\n");
        }

        // 完成
        if let CellKind::ToolCall { exit_code, summary, .. } = &mut buf.cells[0].kind {
            *exit_code = Some(0);
            *summary = Some("OK".into());
        }
        buf.cells[0].state = CellState::Committed;
        buf.active_tool_index = None;

        assert_eq!(buf.cells[0].state, CellState::Committed);
        if let CellKind::ToolCall { output, exit_code, summary, .. } = &buf.cells[0].kind {
            assert_eq!(output, "line 1\nline 2\n");
            assert_eq!(*exit_code, Some(0));
            assert_eq!(summary.as_deref(), Some("OK"));
        }
    }
}
