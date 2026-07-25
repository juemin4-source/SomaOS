//! # SomaTuiApp — eye_declare 0.6 App 实现
//!
//! 设计原则：纯 Elm 架构。fallthrough 将输入事件转为消息，
//! update() 处理消息并改变状态，tail() 只读投影。

use soma_ui_protocol::{Cell, CellBuffer, CellKind, CellState, UiEvent, UiEventKind};

use soma_client::SomaClient;
use soma_protocol::events::{RuntimeEventEnvelope, RuntimeEventKind};
use crate::session;

use eye_declare::app::{App, Ctx};
use eye_declare::element::{ElementExt, Fluent};
use eye_declare::focus::{Focus, FocusHandle};
use eye_declare::input::{InputEvent, Keymap, key, keymap};
use eye_declare::markdown::markdown;
use eye_declare::panel::panel;
use eye_declare::spinner::spinner;
use eye_declare::stack::{col, row};
use eye_declare::task::Task;
use eye_declare::text::text;
use eye_declare::text_area::{TextAreaState, text_area};
use crossterm::event::KeyCode;

use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

// ── 常量 ─────────────────────────────────────────────────────────

/// 输入区最大可见行数
const INPUT_MAX_HEIGHT: u16 = 8;

// ── 消息类型 ─────────────────────────────────────────────────────

/// 驱动 App 的消息
#[derive(Debug, Clone)]
pub enum Msg {
    /// 收到 Runtime 的 UiEvent
    UiEventReceived(UiEvent),
    /// 用户提交输入
    SubmitInput,
    /// Ctrl+C — 处理中则取消，否则退出
    CtrlCPressed,
    /// Ctrl+D — 立即退出
    Quit,
    /// Esc — 关闭覆盖层
    DismissOverlay,
    /// 来自 text_area 的原始输入事件（fallthrough 转发）
    RawInput(InputEvent),
    /// 用户批准了待审批的操作（Y key）
    ApprovePending,
    /// 时钟滴答 / 占位
    Tick,
}

// ── App 模型 ────────────────────────────────────────────────────

/// App 状态（纯数据）
pub struct SomaTuiModel {
    pub cell_buffer: CellBuffer,
    pub input: TextAreaState,
    #[allow(dead_code)]
    pub focus: Focus,
    pub input_focus: FocusHandle,
    pub is_processing: bool,
    pub active_tool_summary: Option<String>,
    pub pending_approval: Option<String>,
    pub pending_approval_id: Option<String>,
    pub status: String,
}

impl SomaTuiModel {
    pub fn new() -> Self {
        let focus = Focus::new();
        let input_focus = focus.handle();
        input_focus.focus();
        Self {
            cell_buffer: CellBuffer::new(),
            input: TextAreaState::new(),
            focus,
            input_focus,
            is_processing: false,
            active_tool_summary: None,
            pending_approval: None,
            pending_approval_id: None,
            status: "SomaOS TUI 0.1 — ready".into(),
        }
    }

    /// 处理一个 UiEvent
    pub fn apply_ui_event(&mut self, event: UiEvent) {
        let seq = event.sequence;

        match event.kind {
            UiEventKind::TurnStarted => {
                self.is_processing = true;
                self.status = format!("Turn {} started", event.turn_id);
                // 创建新的活跃 assistant cell
                self.cell_buffer.push_cell(Cell {
                    kind: CellKind::AssistantMessage {
                        committed_text: String::new(),
                        pending_text: String::new(),
                    },
                    state: CellState::Active,
                    task_id: event.task_id.clone(),
                    turn_id: event.turn_id.clone(),
                    created_at: seq,
                });
            }

            UiEventKind::StreamChunk { text, newline_count: _, is_final } => {
                // 追加到活跃 assistant cell
                if let Some(cell) = self.cell_buffer.active_assistant_mut() {
                    if let CellKind::AssistantMessage { committed_text, pending_text } = &mut cell.kind {
                        pending_text.push_str(&text);
                        // 将已完成的行（含 \n）移到 committed
                        if let Some(newline_pos) = pending_text.rfind('\n') {
                            committed_text.push_str(&pending_text[..=newline_pos]);
                            pending_text.drain(..=newline_pos);
                        }
                    }
                }
                if is_final {
                    self.status = "Stream complete".into();
                }
            }

            UiEventKind::ToolCallStarted { call_id, capability, args_display } => {
                self.active_tool_summary = Some(format!("Running {}", capability));
                self.status = format!("Tool: {}", capability);
                self.cell_buffer.push_cell(Cell {
                    kind: CellKind::ToolCall {
                        call_id,
                        capability,
                        args_display,
                        output: String::new(),
                        truncated: false,
                        exit_code: None,
                        summary: None,
                        log_path: None,
                    },
                    state: CellState::Active,
                    task_id: event.task_id.clone(),
                    turn_id: event.turn_id.clone(),
                    created_at: seq,
                });
            }

            UiEventKind::ToolCallOutput { call_id, output, truncated } => {
                self.cell_buffer.append_tool_output(&call_id, &output);
                if truncated {
                    // 标记截断（实际截断已在 runtime 侧完成）
                }
            }

            UiEventKind::ToolCallCompleted { call_id: _call_id, exit_code, summary, log_path } => {
                self.active_tool_summary = None;
                let icon = if exit_code == 0 { "✓" } else { "✗" };
                self.status = format!("Tool {}: {}", icon, summary);
                self.cell_buffer.complete_active_tool(exit_code, summary, log_path);
            }

            UiEventKind::TurnCompleted => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = "Ready".into();
                self.cell_buffer.commit_all_active();
            }

            UiEventKind::TurnInterrupted => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = "Interrupted".into();
                self.cell_buffer.interrupt_all_active();
            }

            UiEventKind::TurnFailed { error } => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = format!("Failed: {}", error);
                self.cell_buffer.fail_all_active();
            }

            UiEventKind::ApprovalRequired { approval_id, prompt, .. } => {
                self.pending_approval = Some(prompt);
                self.pending_approval_id = Some(approval_id);
                self.status = "Approval required — press Y/y to approve, Esc to reject".into();
            }

            UiEventKind::UserInputRequired { prompt, .. } => {
                self.status = format!("Input required: {}", prompt);
            }

            UiEventKind::SystemMessage { level, text: msg } => {
                self.status = format!("[{}] {}", level, msg);
            }

            UiEventKind::WorkStateChanged { combo, stage } => {
                self.status = format!("[{}] {}", combo, stage);
            }

            UiEventKind::ArtifactCreated { path: art_path, summary } => {
                self.status = format!("Artifact: {} ({})", summary, art_path);
            }

            UiEventKind::DiffAvailable { diff_text, file_path } => {
                self.status = format!("Diff: {}", file_path.as_deref().unwrap_or("(inline)"));
                self.cell_buffer.push_cell(Cell {
                    kind: CellKind::Diff { diff_text, file_path },
                    state: CellState::Committed,
                    task_id: event.task_id,
                    turn_id: event.turn_id,
                    created_at: seq,
                });
            }

            _ => {}
        }
    }
}

// ── eye_declare App ─────────────────────────────────────────────

pub struct SomaTuiApp {
    pub model: SomaTuiModel,
    /// SomaClient（内部已使用 Arc 共享，clone 即增加引用）
    pub client: Arc<SomaClient>,
    /// 当前任务 ID
    pub task_id: String,
    /// 正在执行中的异步任务（hold 住防止被 cancel）
    _pending_task: Option<Task>,
}

impl SomaTuiApp {
    /// 创建 App，从 SomaClient 获取 task_id
    pub fn new(client: SomaClient) -> Self {
        let task_id = client.task_id().unwrap_or("unknown").to_string();
        let client = Arc::new(client);
        Self {
            model: SomaTuiModel::new(),
            client,
            task_id,
            _pending_task: None,
        }
    }

    /// 使用已恢复的模型创建 App
    #[allow(dead_code)]
    pub fn new_with_model(client: SomaClient, model: SomaTuiModel) -> Self {
        let task_id = client.task_id().unwrap_or("unknown").to_string();
        let client = Arc::new(client);
        Self {
            model,
            client,
            task_id,
            _pending_task: None,
        }
    }
}

impl App for SomaTuiApp {
    type Msg = Msg;
    type Output = ();

    /// 启动时：从 SomaClient 订阅事件，spawn 为消息流
    fn init(&mut self, ctx: &mut Ctx<'_, Self>) {
        let rx = self.client.subscribe_events();
        let stream = BroadcastStream::new(rx)
            .filter_map(|result| match result {
                Ok(envelope) => runtime_event_to_ui(envelope),
                Err(_) => None,
            })
            .map(|ui_event| Msg::UiEventReceived(ui_event));
        ctx.spawn(stream).detach();
    }

    fn update(&mut self, msg: Self::Msg, ctx: &mut Ctx<'_, Self>) {
        let m = &mut self.model;
        match msg {
            Msg::UiEventReceived(event) => {
                // 判断是否是 TurnCompleted，以便在 apply 后保存
                let is_turn_end = matches!(&event.kind,
                    UiEventKind::TurnCompleted |
                    UiEventKind::TurnFailed { .. } |
                    UiEventKind::TurnInterrupted);
                m.apply_ui_event(event);
                if is_turn_end {
                    if let Err(e) = session::save_session(&self.task_id, ".", &m.cell_buffer) {
                        tracing::warn!(error = %e, "Failed to save session after turn end");
                    }
                }
            }

            Msg::SubmitInput => {
                let text = m.input.take_text();
                if !text.is_empty() {
                    // 把用户消息加入 CellBuffer（立即显示）
                    m.cell_buffer.push_cell(Cell {
                        kind: CellKind::UserMessage { text: text.clone() },
                        state: CellState::Committed,
                        task_id: self.task_id.clone(),
                        turn_id: String::new(),
                        created_at: 0,
                    });
                    m.status = format!("Sending: {}", &text[..text.len().min(40)]);
                    let client = self.client.clone();
                    // 必须 hold 住 Task，否则 perform 的 async 工作会被立即取消
                    self._pending_task = Some(ctx.perform(async move {
                        match client.send_message(&text).await {
                            Ok(_) => tracing::info!("Message sent"),
                            Err(e) => tracing::error!(error = %e, "Failed to send message"),
                        }
                        Msg::Tick
                    }));
                }
            }

            Msg::CtrlCPressed => {
                if m.is_processing {
                    m.status = "Cancelling…".into();
                    let client = self.client.clone();
                    self._pending_task = Some(ctx.perform(async move {
                        match client.cancel().await {
                            Ok(_) => tracing::info!("Cancel sent"),
                            Err(e) => tracing::warn!(error = %e, "Cancel failed"),
                        }
                        Msg::Tick
                    }));
                } else {
                    ctx.exit(());
                }
            }

            Msg::Quit => {
                // 保存会话
                if let Err(e) = session::save_session(&self.task_id, ".", &m.cell_buffer) {
                    tracing::warn!(error = %e, "Failed to save session on quit");
                }
                // SomaClient 的 Drop 会自动关闭子进程
                ctx.exit(());
            }

            Msg::ApprovePending => {
                // 用户批准 → 通知 Runtime
                let approval_id = m.pending_approval_id.take();
                m.pending_approval = None;

                if let Some(aid) = approval_id {
                    m.status = "Approved — sending to Runtime".into();
                    let client = self.client.clone();
                    let _ = ctx.perform(async move {
                        let _ = client.approve(&aid).await;
                        Msg::Tick
                    });
                } else {
                    m.status = "Approved".into();
                }
            }

            Msg::DismissOverlay => {
                // 用户拒绝/关闭 → 通知 Runtime
                let approval_id = m.pending_approval_id.take();
                m.pending_approval = None;

                if let Some(aid) = approval_id {
                    m.status = "Rejected — sending to Runtime".into();
                    let client = self.client.clone();
                    let _ = ctx.perform(async move {
                        let _ = client.reject(&aid).await;
                        Msg::Tick
                    });
                } else {
                    m.status = "Dismissed".into();
                }
            }

            Msg::RawInput(event) => {
                m.input.handle(&event);
            }

            Msg::Tick => {
                // 动画/占位 — 无需操作
            }
        }
    }

    fn tail(&self) -> impl eye_declare::element::Element + '_ {
        let model = &self.model;
        let is_busy = model.is_processing || model.active_tool_summary.is_some();
        let cells = model.cell_buffer.cells();

        col()
            // ── Cell 渲染（已提交 + 活跃） ──
            .children(cells.iter().map(|cell| render_cell_element(cell)))
            // 活跃处理指示器
            .when(is_busy, |c| {
                c.child(
                    col()
                        .when_some(model.active_tool_summary.as_ref(), |c, tool| {
                            c.child(text(tool.clone()))
                        })
                        .when(
                            model.is_processing && model.active_tool_summary.is_none(),
                            |c| c.child(text("Thinking…")),
                        )
                        .child(spinner("⏳")),
                )
            })
            // 审批覆盖层
            .when_some(model.pending_approval.as_ref(), |c, prompt| {
                c.child(panel(text(format!("[Approval] {}", prompt))).title("Approval Required"))
            })
            // 输入区
            .child(
                panel(
                    text_area(&model.input)
                        .track_focus(&model.input_focus)
                        .max_height(INPUT_MAX_HEIGHT)
                        .placeholder(
                            "Type your message… (Enter to submit, Ctrl+C to cancel, Ctrl+D to quit)",
                        ),
                )
                .title("Input"),
            )
            // 状态行
            .child(text(&model.status).pad_left(1))
    }

    fn keymap(&self) -> Keymap<Self::Msg> {
        let mut km = keymap();

        // 覆盖层绑定（无视焦点）
        km = km.on_override(key(KeyCode::Char('c')).ctrl(), Msg::CtrlCPressed);
        km = km.on_override(key(KeyCode::Char('d')).ctrl(), Msg::Quit);

        // 审批时：Y 批准（发送到 Runtime）
        if self.model.pending_approval.is_some() {
            km = km.on(key(KeyCode::Char('y')), Msg::ApprovePending);
            km = km.on(key(KeyCode::Char('Y')), Msg::ApprovePending);
        }

        // Esc: 关闭覆盖层
        km = km.on(key(KeyCode::Esc), Msg::DismissOverlay);

        // Enter: 提交输入
        if self.model.pending_approval.is_none() {
            km = km.on(key(KeyCode::Enter), Msg::SubmitInput);
        }

        // 输入区 fallthrough：所有未绑定的键转发为 RawInput
        // update() 中 TextAreaState::handle() 处理这些事件
        km = km.fallthrough(&self.model.input_focus, |event: InputEvent| -> Msg {
            Msg::RawInput(event)
        });

        km
    }
}

// ── Cell 渲染函数 ──────────────────────────────────────────────

/// 将 RuntimeEventEnvelope 转换为 UiEvent
///
/// 与 soma-client 分离：这是 TUI 侧的协议适配层，
/// 保持 soma-client 不依赖 soma-ui-protocol。
fn runtime_event_to_ui(envelope: RuntimeEventEnvelope) -> Option<UiEvent> {
    let task_id = envelope.task_id.clone();
    let turn_id = envelope.turn_id.clone();
    let seq = envelope.sequence;

    let kind: UiEventKind = match &envelope.kind {
        RuntimeEventKind::TurnStarted => UiEventKind::TurnStarted,
        RuntimeEventKind::TurnCompleted => UiEventKind::TurnCompleted,
        RuntimeEventKind::TurnInterrupted => UiEventKind::TurnInterrupted,
        RuntimeEventKind::TurnFailed => {
            let error = envelope.payload.get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            UiEventKind::TurnFailed { error }
        }
        RuntimeEventKind::AssistantDelta => {
            let text = envelope.payload.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let newline_count = text.chars().filter(|&c| c == '\n').count() as u32;
            UiEventKind::StreamChunk { text, newline_count, is_final: false }
        }
        RuntimeEventKind::ToolStarted => {
            let call_id = envelope.payload.get("tool_call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("").to_string();
            let capability = envelope.payload.get("capability_id")
                .and_then(|v| v.as_str())
                .unwrap_or("").to_string();
            let args_display = envelope.payload.get("arguments")
                .map(|v| v.to_string()).unwrap_or_default();
            UiEventKind::ToolCallStarted { call_id, capability, args_display }
        }
        RuntimeEventKind::ToolUpdated => {
            let call_id = envelope.payload.get("tool_call_id")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let output = envelope.payload.get("output")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let truncated = envelope.payload.get("truncated")
                .and_then(|v| v.as_bool()).unwrap_or(false);
            UiEventKind::ToolCallOutput { call_id, output, truncated }
        }
        RuntimeEventKind::ToolCompleted => {
            let call_id = envelope.payload.get("tool_call_id")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let success = envelope.payload.get("success")
                .and_then(|v| v.as_bool()).unwrap_or(false);
            let exit_code = if success { 0 } else { 1 };
            let summary = envelope.payload.get("result_summary")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let log_path = envelope.payload.get("log_path")
                .and_then(|v| v.as_str()).map(|s| s.to_string());
            UiEventKind::ToolCallCompleted { call_id, exit_code, summary, log_path }
        }
        RuntimeEventKind::WorkStateChanged => {
            let combo = envelope.payload.get("combo")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let stage = envelope.payload.get("stage")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            UiEventKind::WorkStateChanged { combo, stage }
        }
        RuntimeEventKind::ArtifactCreated => {
            let path = envelope.payload.get("path")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let summary = envelope.payload.get("summary")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            UiEventKind::ArtifactCreated { path, summary }
        }
        RuntimeEventKind::ApprovalRequested => {
            let approval_id = envelope.payload.get("approval_id")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let prompt = envelope.payload.get("prompt")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let timeout_ms = envelope.payload.get("timeout_ms")
                .and_then(|v| v.as_u64());
            UiEventKind::ApprovalRequired { approval_id, prompt, timeout_ms }
        }
        RuntimeEventKind::DecisionRequested => {
            let input_id = envelope.payload.get("input_id")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let prompt = envelope.payload.get("prompt")
                .and_then(|v| v.as_str()).unwrap_or("").to_string();
            let default = envelope.payload.get("default")
                .and_then(|v| v.as_str()).map(|s| s.to_string());
            UiEventKind::UserInputRequired { input_id, prompt, default }
        }
        _ => return None,
    };

    Some(UiEvent::new(&task_id, &turn_id, seq, kind))
}

/// 截断长输出：保留 head 行 + ellipsis + tail 行
///
/// 参考 Codex TUI 的 `truncate_lines_middle` 模式：
/// head 和 tail 之间的行被一行 "… +N lines omitted" 替代。
fn truncate_output(output: &str, head: usize, tail: usize) -> String {
    let lines: Vec<&str> = output.lines().collect();
    let total = lines.len();
    if total <= head + tail + 1 {
        return output.to_string();
    }

    let mut result: Vec<String> = Vec::new();
    for &line in lines[..head.min(total)].iter() {
        result.push(line.to_string());
    }
    let omitted = total - head - tail;
    result.push(format!("… +{} lines omitted", omitted));
    if tail > 0 {
        for &line in lines[total - tail..].iter() {
            result.push(line.to_string());
        }
    }
    result.join("\n")
}

/// 将一个 Cell 渲染为 eye_declare Element
fn render_cell_element(cell: &Cell) -> eye_declare::element::AnyElement<'_> {
    let el: eye_declare::element::AnyElement<'_> = match &cell.kind {
        CellKind::UserMessage { text: msg } => {
            col().child(text(format!("You: {}", msg))).any()
        }

        CellKind::AssistantMessage { committed_text, pending_text } => {
            let mut parts = col();

            // 已提交的文本（用 markdown 渲染）
            if !committed_text.is_empty() {
                parts = parts.child(markdown(committed_text.clone()));
            }

            // 未完成的行（流式 buffer）
            if !pending_text.is_empty() {
                parts = parts.child(text(pending_text.clone()));
            }

            // 正在流式的指示器
            if cell.state == CellState::Active {
                parts = parts.child(spinner("…"));
            }

            parts.any()
        }

        CellKind::ToolCall { capability, output, exit_code, summary, .. } => {
            let status = match exit_code {
                Some(0) => "✓",
                Some(_) => "✗",
                None => "●",
            };

            let mut parts = col().child(text(format!("{} {}", status, capability))).gap(0);

            // 输出截断：head (5) + ellipsis + tail (3)
            if !output.is_empty() {
                let truncated = truncate_output(output, 5, 3);
                for line in truncated.lines() {
                    parts = parts.child(text(format!("  {}", line)));
                }
            }

            if let Some(s) = summary {
                parts = parts.child(text(format!("  Result: {}", s)));
            }

            if exit_code.is_none() {
                parts = parts.child(row().fill(text("Running…")).fixed(3, spinner("…")));
            }
            parts.any()
        }

        CellKind::Diff { diff_text, file_path } => {
            let mut parts = col();
            if let Some(path) = file_path {
                parts = parts.child(text(format!("Diff: {}", path)));
            }
            for line in diff_text.lines() {
                let styled = if line.starts_with("+++") || line.starts_with("---") {
                    format!("  {}", line)
                } else if line.starts_with('+') {
                    format!("+ {}", &line[1..])
                } else if line.starts_with('-') {
                    format!("- {}", &line[1..])
                } else if line.starts_with("@@") {
                    format!("  {}", line)
                } else {
                    format!("  {}", line)
                };
                parts = parts.child(text(styled));
            }
            parts.any()
        }

        CellKind::SystemMessage { level, text: msg } => {
            col().child(text(format!("[{}] {}", level, msg))).any()
        }

        CellKind::WorkState { combo, stage } => {
            col().child(text(format!("[{}] {}", combo, stage))).any()
        }

        CellKind::Artifact { path, summary } => {
            col().child(text(format!("📎 {} ({})", summary, path))).any()
        }

        CellKind::ApprovalRequest { prompt, .. } => {
            col().child(panel(text(format!("[Approval] {}", prompt))).title("Approval Required")).any()
        }

        CellKind::UserInputRequest { prompt, .. } => {
            col().child(text(format!("[Input] {}", prompt))).any()
        }
    };
    el
}

#[cfg(test)]
mod tests {
    use super::*;
    use soma_ui_protocol::UiEvent;

    fn make_event(kind: UiEventKind) -> UiEvent {
        UiEvent::new("test-task", "test-turn", 0, kind)
    }

    #[test]
    fn test_initial_state() {
        let model = SomaTuiModel::new();
        assert!(!model.is_processing);
        assert!(model.active_tool_summary.is_none());
        assert!(model.pending_approval.is_none());
        assert!(model.status.contains("ready"));
    }

    #[test]
    fn test_turn_started_sets_processing() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnStarted));
        assert!(model.is_processing);
        assert!(model.status.contains("started"));
    }

    #[test]
    fn test_turn_completed_resets_processing() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnStarted));
        assert!(model.is_processing);

        model.apply_ui_event(make_event(UiEventKind::TurnCompleted));
        assert!(!model.is_processing);
        assert!(model.status.contains("Ready"));
    }

    #[test]
    fn test_turn_interrupted_resets_and_shows_status() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnInterrupted));
        assert!(!model.is_processing);
        assert!(model.status.contains("Interrupted"));
    }

    #[test]
    fn test_turn_failed_resets_and_shows_error() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::TurnFailed { error: "timeout".into() },
        ));
        assert!(!model.is_processing);
        assert!(model.status.contains("Failed"));
        assert!(model.status.contains("timeout"));
    }

    #[test]
    fn test_tool_call_start_sets_active_tool() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::ToolCallStarted {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{\"path\":\"/tmp/x\"}".into(),
            },
        ));
        assert!(model.active_tool_summary.is_some());
        assert!(model.active_tool_summary.as_deref().unwrap().contains("file_read"));
    }

    #[test]
    fn test_tool_call_completed_clears_active_tool() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::ToolCallStarted {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{}".into(),
            },
        ));
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 1,
            UiEventKind::ToolCallCompleted {
                call_id: "call-1".into(),
                exit_code: 0,
                summary: "read 3 files".into(),
                log_path: None,
            },
        ));
        assert!(model.active_tool_summary.is_none());
        assert!(model.status.contains("✓"));
    }

    #[test]
    fn test_tool_call_failed_shows_error_icon() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::ToolCallCompleted {
                call_id: "fail-1".into(),
                exit_code: 1,
                summary: "permission denied".into(),
                log_path: None,
            },
        ));
        assert!(model.status.contains("✗"));
    }

    #[test]
    fn test_approval_required_sets_pending() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::ApprovalRequired {
                approval_id: "apr-1".into(),
                prompt: "Allow file write?".into(),
                timeout_ms: None,
            },
        ));
        assert!(model.pending_approval.is_some());
        assert_eq!(model.pending_approval.as_deref(), Some("Allow file write?"));
    }

    #[test]
    fn test_system_message_shows_level_and_text() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::SystemMessage {
                level: "error".into(),
                text: "connection refused".into(),
            },
        ));
        assert!(model.status.contains("[error]"));
        assert!(model.status.contains("connection refused"));
    }

    #[test]
    fn test_user_input_required_sets_status() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::UserInputRequired {
                input_id: "in-1".into(),
                prompt: "Enter path:".into(),
                default: None,
            },
        ));
        assert!(model.status.contains("Input required"));
    }

    #[test]
    fn test_work_state_changed() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::WorkStateChanged {
                combo: "investigate".into(),
                stage: "Phase 2".into(),
            },
        ));
        assert!(model.status.contains("investigate"));
        assert!(model.status.contains("Phase 2"));
    }

    #[test]
    fn test_artifact_created() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::ArtifactCreated {
                path: "/tmp/result.txt".into(),
                summary: "analysis result".into(),
            },
        ));
        assert!(model.status.contains("Artifact"));
        assert!(model.status.contains("analysis result"));
    }

    #[test]
    fn test_stream_chunk_final_updates_status() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1", "t1-1", 0,
            UiEventKind::StreamChunk {
                text: "hello\n".into(),
                newline_count: 1,
                is_final: true,
            },
        ));
        assert!(model.status.contains("Stream complete"));
    }

    #[test]
    fn test_submit_input_clears_text() {
        let mut model = SomaTuiModel::new();
        model.input.set_text("hello");

        // 直接测试模型行为
        assert_eq!(model.input.take_text(), "hello");
        assert!(model.input.is_blank());
        assert!(!model.status.contains("hello"));
    }

    // ── truncate_output 测试 ──

    #[test]
    fn test_truncate_short_output_no_truncation() {
        let out = truncate_output("line1\nline2\nline3", 5, 3);
        assert_eq!(out, "line1\nline2\nline3");
    }

    #[test]
    fn test_truncate_long_output_head_tail_ellipsis() {
        let out = truncate_output("a\nb\nc\nd\ne\nf\ng\nh\ni\nj", 3, 2);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines[0], "a");
        assert_eq!(lines[1], "b");
        assert_eq!(lines[2], "c");
        assert!(lines[3].contains("omitted"));
        assert_eq!(lines[4], "i");
        assert_eq!(lines[5], "j");
        assert_eq!(lines.len(), 6);
    }

    #[test]
    fn test_truncate_empty_output() {
        assert_eq!(truncate_output("", 5, 3), "");
    }

    #[test]
    fn test_truncate_single_line() {
        assert_eq!(truncate_output("only", 5, 3), "only");
    }

    #[test]
    fn test_truncate_exact_boundary_no_ellipsis() {
        // 6 行，head=3, tail=2: 3+2=5 < 6 → 需要截断
        let out = truncate_output("1\n2\n3\n4\n5\n6", 3, 3);
        assert_eq!(out.lines().count(), 6); // 3 head + 0 tail + 3... wait
        // 3+3=6 ≤ 6 → 不需要截断
        assert_eq!(out, "1\n2\n3\n4\n5\n6");
    }

    #[test]
    fn test_truncate_zero_tail() {
        let out = truncate_output("a\nb\nc\nd\ne", 2, 0);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines[0], "a");
        assert_eq!(lines[1], "b");
        assert!(lines[2].contains("omitted"));
        assert_eq!(lines.len(), 3);
    }
}
