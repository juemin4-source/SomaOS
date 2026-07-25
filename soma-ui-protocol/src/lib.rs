//! # Soma UI Protocol
//!
//! 结构化 UI 事件协定 —— 定义 Soma Runtime 向 TUI 发送的渲染就绪事件。
//!
//! ## 设计原则
//!
//! - **只投影**：事件携带的信息足以让 TUI 直接渲染，无需解释运行时状态。
//! - **更新导向**：不是运行时事实的完整日志，而是增量 UI 更新。
//! - **serde 序列化**：可跨进程边界（stdio/WebSocket）传输。
//! - **一次构建**：事件在 Runtime 侧组装，TUI 侧只消费。
//!
//! ## 事件流生命周期
//!
//! ```text
//! TurnStarted
//!   ├─ StreamChunk*       (assistant delta, newline-gated)
//!   ├─ ToolCallStarted
//!   │  ├─ ToolCallOutput* (streaming tool output)
//!   │  └─ ToolCallCompleted
//!   ├─ StreamChunk*       (assistant text between tools)
//!   ├─ ...
//!   ├─ ApprovalRequired?  (user must approve)
//!   ├─ UserInputRequired? (user must type input)
//!   └─ TurnCompleted | TurnFailed | TurnInterrupted
//! ```
//!
//! TUI 维护一个 [`CellBuffer`] 追踪所有活跃的 cell。每个事件要么
//! 创建一个新 cell（`TurnStarted`、`ToolCallStarted`、`DisplayCell`）、
//! 更新已有 cell（`StreamChunk`、`ToolCallOutput`），要么终结它
//! （`ToolCallCompleted`、`TurnCompleted`）。

mod ui_event;
mod cell_buffer;

pub use ui_event::*;
pub use cell_buffer::*;
