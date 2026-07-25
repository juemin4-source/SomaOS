//! # Cell 渲染模块
//!
//! 提供 CellKind 的渲染投影函数与测试。
//! 渲染逻辑的实现在 app.rs 的 render_cell_element() 中。
//! 此模块保留作为格式化参考和测试验证层。
#![allow(dead_code)]

use soma_ui_protocol::{CellKind, CellState};

/// cell 可渲染内容的投影
pub struct RenderedCell {
    /// 标题行（如 "You", "Assistant", "Running file_read…"）
    pub header: String,
    /// 主体内容（markdown 或纯文本）
    pub body: String,
    /// 状态标记
    pub status: CellState,
    /// 缩进级别（tool call 嵌套用）
    pub indent: u8,
}

/// 将 CellKind 投影为可渲染内容
pub fn render_cell(kind: &CellKind) -> RenderedCell {
    match kind {
        CellKind::UserMessage { text: msg } => RenderedCell {
            header: "You".to_string(),
            body: msg.clone(),
            status: CellState::Committed,
            indent: 0,
        },

        CellKind::AssistantMessage { committed_text, pending_text } => {
            let body = format!("{}{}", committed_text, pending_text);
            let has_pending = !pending_text.is_empty();
            RenderedCell {
                header: if has_pending { "Assistant ●".into() } else { "Assistant".into() },
                body,
                status: if has_pending { CellState::Active } else { CellState::Committed },
                indent: 0,
            }
        }

        CellKind::ToolCall { capability, output, exit_code, summary, .. } => {
            let status_icon = match exit_code {
                Some(0) => "✓",
                Some(_) => "✗",
                None => "●",
            };
            let mut body = output.clone();
            if let Some(s) = summary {
                if !body.is_empty() {
                    body.push('\n');
                }
                body.push_str(&format!("Result: {}", s));
            }
            let header = format!("{} {}", status_icon, capability);
            RenderedCell {
                header,
                body,
                status: if exit_code.is_some() { CellState::Committed } else { CellState::Active },
                indent: 1,
            }
        }

        CellKind::SystemMessage { level, text } => RenderedCell {
            header: format!("[{}]", level),
            body: text.clone(),
            status: CellState::Committed,
            indent: 0,
        },

        CellKind::WorkState { combo, stage } => RenderedCell {
            header: format!("Work: {}", combo),
            body: stage.clone(),
            status: CellState::Committed,
            indent: 0,
        },

        CellKind::Artifact { path, summary } => RenderedCell {
            header: "Artifact".to_string(),
            body: format!("{} ({})", summary, path),
            status: CellState::Committed,
            indent: 0,
        },

        CellKind::ApprovalRequest { prompt, .. } => RenderedCell {
            header: "Approval Required".to_string(),
            body: prompt.clone(),
            status: CellState::Active,
            indent: 0,
        },

        CellKind::UserInputRequest { prompt, .. } => RenderedCell {
            header: "Input Required".to_string(),
            body: prompt.clone(),
            status: CellState::Active,
            indent: 0,
        },
        CellKind::Diff { diff_text, file_path } => RenderedCell {
            header: file_path.clone().unwrap_or_else(|| "Diff".to_string()),
            body: diff_text.clone(),
            status: CellState::Committed,
            indent: 0,
        },
    }
}

/// 将整批 cell 渲染为文本预览（用于调试和测试）
pub fn render_cells_preview(cells: &[soma_ui_protocol::Cell]) -> String {
    let mut out = String::new();
    for cell in cells {
        let rendered = render_cell(&cell.kind);
        out.push_str(&format!(
            "{:12} | {}\n",
            rendered.header,
            rendered.body.lines().next().unwrap_or(""),
        ));
        if rendered.body.lines().count() > 1 {
            for line in rendered.body.lines().skip(1) {
                out.push_str(&format!("{:12} | {}\n", "", line));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use soma_ui_protocol::{Cell, CellKind, CellState};

    #[test]
    fn test_render_user_message() {
        let kind = CellKind::UserMessage { text: "hello".into() };
        let r = render_cell(&kind);
        assert_eq!(r.header, "You");
    }

    #[test]
    fn test_render_assistant_message() {
        let kind = CellKind::AssistantMessage {
            committed_text: "Hello\n".into(),
            pending_text: "world".into(),
        };
        let r = render_cell(&kind);
        assert_eq!(r.header, "Assistant ●");
        assert_eq!(r.body, "Hello\nworld");
        assert_eq!(r.status, CellState::Active);
    }

    #[test]
    fn test_render_tool_call_running() {
        let kind = CellKind::ToolCall {
            call_id: "call-1".into(),
            capability: "file_read".into(),
            args_display: "{}".into(),
            output: "reading…".into(),
            truncated: false,
            exit_code: None,
            summary: None,
            log_path: None,
        };
        let r = render_cell(&kind);
        assert!(r.header.contains("●"));
        assert_eq!(r.status, CellState::Active);
    }

    #[test]
    fn test_render_tool_call_completed() {
        let kind = CellKind::ToolCall {
            call_id: "call-1".into(),
            capability: "file_read".into(),
            args_display: "{}".into(),
            output: "file content".into(),
            truncated: false,
            exit_code: Some(0),
            summary: Some("OK".into()),
            log_path: None,
        };
        let r = render_cell(&kind);
        assert!(r.header.contains("✓"));
        assert_eq!(r.status, CellState::Committed);
        assert!(r.body.contains("Result: OK"));
    }

    #[test]
    fn test_render_system_message() {
        let kind = CellKind::SystemMessage {
            level: "error".into(),
            text: "something went wrong".into(),
        };
        let r = render_cell(&kind);
        assert_eq!(r.header, "[error]");
        assert_eq!(r.body, "something went wrong");
    }

    #[test]
    fn test_render_approval_request() {
        let kind = CellKind::ApprovalRequest {
            approval_id: "a-1".into(),
            prompt: "Allow file read?".into(),
        };
        let r = render_cell(&kind);
        assert_eq!(r.header, "Approval Required");
        assert_eq!(r.body, "Allow file read?");
        assert_eq!(r.status, CellState::Active);
    }

    #[test]
    fn test_cells_preview() {
        let cells = vec![
            Cell {
                kind: CellKind::UserMessage { text: "hello".into() },
                state: CellState::Committed,
                task_id: "t1".into(),
                turn_id: "t1-1".into(),
                created_at: 0,
            },
            Cell {
                kind: CellKind::AssistantMessage {
                    committed_text: "Hello!\nHow can I help?".into(),
                    pending_text: String::new(),
                },
                state: CellState::Committed,
                task_id: "t1".into(),
                turn_id: "t1-1".into(),
                created_at: 1,
            },
        ];

        let preview = render_cells_preview(&cells);
        assert!(preview.contains("You"));
        assert!(preview.contains("Assistant"));
        assert!(preview.contains("Hello!"));
    }
}
