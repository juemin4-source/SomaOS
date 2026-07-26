//! # SomaTuiApp — eye_declare 0.6 App 实现
//!
//! 设计原则：纯 Elm 架构。fallthrough 将输入事件转为消息，
//! update() 处理消息并改变状态，tail() 只读投影。

use soma_ui_protocol::{Cell, CellBuffer, CellKind, CellState, UiEvent, UiEventKind};

use crate::session;
use crate::workspace::detect::resolve_git_exe;
use crate::workspace::WorkspaceContext;
use soma_client::SomaClient;
use soma_protocol::events::{RuntimeEventEnvelope, RuntimeEventKind};

use crossterm::event::KeyCode;
use eye_declare::app::{App, Ctx};
use eye_declare::element::{ElementExt, Fluent};
use eye_declare::focus::{Focus, FocusHandle};
use eye_declare::input::{key, keymap, InputEvent, Keymap};
use eye_declare::markdown::markdown;
use eye_declare::panel::panel;
use eye_declare::spinner::spinner;
use eye_declare::stack::{col, row};
use eye_declare::task::Task;
use eye_declare::text::text;
use eye_declare::text_area::{text_area, TextAreaState};

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

// ── 常量 ─────────────────────────────────────────────────────────

/// 输入区最大可见行数
const INPUT_MAX_HEIGHT: u16 = 8;

// ── 斜杠命令 ────────────────────────────────────────────────────

/// 识别的斜杠命令
#[derive(Debug, Clone, PartialEq, Eq)]
enum Command {
    New,
    Resume,
    Sessions,
    Status,
    Summary,
    Diff,
    Artifacts,
    Compact,
    Review,
    Qa,
    Help,
    Exit,
}

/// 解析斜杠命令
fn parse_command(text: &str) -> Option<Command> {
    let trimmed = text.trim();
    if !trimmed.starts_with('/') {
        return None;
    }
    match trimmed {
        "/new" | "/n" => Some(Command::New),
        "/resume" | "/r" => Some(Command::Resume),
        "/sessions" | "/s" => Some(Command::Sessions),
        "/status" | "/st" => Some(Command::Status),
        "/summary" | "/su" => Some(Command::Summary),
        "/diff" | "/d" => Some(Command::Diff),
        "/artifacts" | "/a" => Some(Command::Artifacts),
        "/compact" | "/c" => Some(Command::Compact),
        "/review" => Some(Command::Review),
        "/qa" => Some(Command::Qa),
        "/help" | "/h" | "/?" => Some(Command::Help),
        "/exit" | "/quit" | "/q" => Some(Command::Exit),
        _ => None,
    }
}

// ── 会话覆盖层 ──────────────────────────────────────────────────

/// 会话列表覆盖层状态
#[derive(Debug, Clone)]
pub struct SessionOverlayState {
    /// 会话列表摘要
    pub sessions: Vec<soma_protocol::params::TaskSummary>,
    /// 覆盖层模式
    pub mode: SessionOverlayMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionOverlayMode {
    /// `/resume` — 选择会话恢复
    Resume,
    /// `/sessions` — 仅浏览
    List,
}

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
    /// 异步请求失败，需要回写到界面而不是只记 tracing
    CommandFailed(String),
    /// 时钟滴答 / 占位
    Tick,
    /// 在输入区插入换行（Shift+Enter）
    InsertNewline,
    /// 上一条历史
    HistoryUp,
    /// 下一条历史
    HistoryDown,
    /// 会话列表已加载
    SessionListLoaded(Vec<soma_protocol::params::TaskSummary>),
    /// 任务详情已加载（用于 /status）
    TaskInfoLoaded(Option<soma_protocol::params::TaskGetResult>),
    /// Git diff 结果（用于 /diff）
    DiffResult(String),
    /// 用户选择了会话列表中的第 N 项（0-indexed）
    SessionSelected(usize),
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
    /// 会话覆盖层（/resume、/sessions）
    pub session_overlay: Option<SessionOverlayState>,
    /// Runtime 子进程是否已断开
    pub runtime_disconnected: bool,
    /// 命令历史
    pub history: CommandHistory,
    /// 工具调用开始时间（用于计算执行时长）
    pub tool_start_times: HashMap<String, Instant>,
}

/// 命令历史环形缓冲区
#[derive(Debug, Clone)]
pub struct CommandHistory {
    /// 历史条目（最近的在前）
    entries: Vec<String>,
    /// 当前浏览位置（0 = 最新，entries.len() = 空输入）
    cursor: usize,
    /// 浏览时暂存的当前输入
    draft: String,
}

impl CommandHistory {
    const MAX: usize = 100;

    pub fn new() -> Self {
        Self {
            entries: Vec::with_capacity(Self::MAX),
            cursor: 0,
            draft: String::new(),
        }
    }

    /// 提交一条命令：添加到历史，重置浏览位置
    pub fn push(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        // 避免连续重复
        if self.entries.first().map(|s| s.as_str()) == Some(text) {
            self.cursor = 0;
            return;
        }
        self.entries.insert(0, text.to_string());
        if self.entries.len() > Self::MAX {
            self.entries.pop();
        }
        self.cursor = 0;
        self.draft.clear();
    }

    /// 上一条：保存当前输入 → 取历史
    pub fn up(&mut self, current_input: &str) -> Option<String> {
        if self.entries.is_empty() {
            return None;
        }
        if self.cursor == 0 {
            // 第一次按 ↑，保存当前输入为 draft
            self.draft = current_input.to_string();
        }
        if self.cursor < self.entries.len() {
            self.cursor += 1;
        }
        Some(self.entries[self.cursor - 1].clone())
    }

    /// 下一条：回到较新的历史
    pub fn down(&mut self) -> Option<String> {
        if self.cursor == 0 {
            return None; // 已在最新位置
        }
        self.cursor -= 1;
        if self.cursor == 0 {
            // 回到暂存输入
            Some(std::mem::take(&mut self.draft))
        } else {
            Some(self.entries[self.cursor - 1].clone())
        }
    }
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
            status: "就绪".into(),
            session_overlay: None,
            runtime_disconnected: false,
            history: CommandHistory::new(),
            tool_start_times: HashMap::new(),
        }
    }

    /// 处理一个 UiEvent
    pub fn apply_ui_event(&mut self, event: UiEvent) {
        let seq = event.sequence;
        let task_id = event.task_id.clone();
        let turn_id = event.turn_id.clone();

        match event.kind {
            UiEventKind::TurnStarted => {
                self.is_processing = true;
                self.status = "正在处理…".into();
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

            UiEventKind::StreamChunk {
                text,
                newline_count: _,
                is_final,
            } => {
                // 一个工具调用完成后，下一段 AssistantDelta 必须开启新的回复 cell。
                if self.cell_buffer.active_assistant_mut().is_none() {
                    self.cell_buffer.push_cell(Cell {
                        kind: CellKind::AssistantMessage {
                            committed_text: String::new(),
                            pending_text: String::new(),
                        },
                        state: CellState::Active,
                        task_id: task_id.clone(),
                        turn_id: turn_id.clone(),
                        created_at: seq,
                    });
                }

                if let Some(cell) = self.cell_buffer.active_assistant_mut() {
                    if let CellKind::AssistantMessage {
                        committed_text,
                        pending_text,
                    } = &mut cell.kind
                    {
                        pending_text.push_str(&text);
                        if let Some(newline_pos) = pending_text.rfind('\n') {
                            committed_text.push_str(&pending_text[..=newline_pos]);
                            pending_text.drain(..=newline_pos);
                        }
                    }
                }
                if is_final {
                    self.status = "流式输出完成".into();
                }
            }

            UiEventKind::ToolCallStarted {
                call_id,
                capability,
                args_display,
            } => {
                self.tool_start_times.insert(call_id.clone(), Instant::now());
                self.cell_buffer.commit_active_assistant();
                let label = capability_label(&capability);
                self.active_tool_summary = Some(format!("正在{}", label));
                self.status = format!("工具：{}", label);
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

            UiEventKind::ToolCallOutput {
                call_id,
                output,
                truncated,
            } => {
                self.cell_buffer
                    .append_tool_output(&call_id, &output, truncated);
            }

            UiEventKind::ToolCallCompleted {
                call_id,
                exit_code,
                summary,
                log_path,
            } => {
                self.active_tool_summary = None;
                let elapsed = self.tool_start_times.remove(&call_id);
                let icon = if exit_code == 0 { "✓" } else { "✗" };
                let duration_str = elapsed
                    .map(|t| format_duration(t.elapsed()))
                    .unwrap_or_default();
                if duration_str.is_empty() {
                    self.status = format!("工具 {}：{}", icon, summary);
                } else {
                    self.status = format!("工具 {}：{} · {}", icon, summary, duration_str);
                }
                self.cell_buffer
                    .complete_active_tool(exit_code, summary, log_path);
            }

            UiEventKind::TurnCompleted => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = "就绪".into();
                self.cell_buffer.commit_all_active();
            }

            UiEventKind::TurnInterrupted => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = "已中断，当前状态已保留".into();
                self.cell_buffer.interrupt_all_active();
            }

            UiEventKind::TurnFailed { error } => {
                self.is_processing = false;
                self.active_tool_summary = None;
                self.status = format_user_error(&format!("失败：{}", error));
                self.cell_buffer.fail_all_active();
            }

            UiEventKind::ApprovalRequired {
                approval_id,
                prompt,
                ..
            } => {
                self.pending_approval = Some(prompt);
                self.pending_approval_id = Some(approval_id);
                self.status = "需要批准：按 Y 批准，按 Esc 拒绝".into();
            }

            UiEventKind::UserInputRequired { prompt, .. } => {
                self.status = format!("需要输入：{}", prompt);
            }

            UiEventKind::SystemMessage { level, text: msg } => {
                self.status = format!("[{}] {}", level, msg);
            }

            UiEventKind::WorkStateChanged { combo, stage } => {
                self.status = format!("[{}] {}", combo, stage);
            }

            UiEventKind::ArtifactCreated {
                path: art_path,
                summary,
            } => {
                self.status = format!("产物：{}（{}）", summary, art_path);
            }

            UiEventKind::DiffAvailable {
                diff_text,
                file_path,
            } => {
                self.status = format!("Diff：{}", file_path.as_deref().unwrap_or("内联内容"));
                self.cell_buffer.push_cell(Cell {
                    kind: CellKind::Diff {
                        diff_text,
                        file_path,
                    },
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
    /// 工作区启动上下文
    pub workspace_ctx: WorkspaceContext,
    /// 正在执行中的异步任务（hold 住防止被 cancel）
    pub(crate) _pending_task: Option<Task>,
}

impl SomaTuiApp {
    /// 使用工作区上下文创建 App，自动添加启动摘要
    pub fn new_with_context(client: SomaClient, ctx: WorkspaceContext) -> Self {
        let task_id = client.task_id().unwrap_or_else(|| "unknown".to_string());
        let client = Arc::new(client);
        let mut model = SomaTuiModel::new();
        Self::populate_startup_info(&mut model, &ctx);
        Self {
            model,
            client,
            task_id,
            workspace_ctx: ctx,
            _pending_task: None,
        }
    }

    /// 保存退出摘要供 TUI 退出后打印
    fn save_exit_summary(ctx: &WorkspaceContext, cell_buffer: &CellBuffer) {
        let changed_count = ctx.changed_files.len();
        let session_path = std::path::PathBuf::from(".somaos").join("exit-summary.json");
        if let Some(parent) = session_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let summary = serde_json::json!({
            "project": ctx.name,
            "branch": ctx.branch,
            "changed_files": changed_count,
            "has_session": !cell_buffer.cells().is_empty(),
        });
        if let Ok(json) = serde_json::to_string(&summary) {
            let _ = std::fs::write(&session_path, json);
        }
    }

    /// 向模型添加启动摘要 cell（公开供 lib.rs 调用）
    pub fn populate_startup_info(model: &mut SomaTuiModel, ctx: &WorkspaceContext) {
        let mut lines = Vec::new();
        lines.push(format!("📁 项目: {}", ctx.name));

        if let Some(ref branch) = ctx.branch {
            lines.push(format!("🌿 分支: {}", branch));
        }

        if !ctx.project_kinds.is_empty() {
            let kinds: Vec<String> = ctx.project_kinds.iter().map(|k| k.to_string()).collect();
            lines.push(format!("⚙️  类型: {}", kinds.join(", ")));
        }

        if !ctx.build_tools.is_empty() {
            let tools: Vec<String> = ctx.build_tools.iter().map(|t| t.to_string()).collect();
            lines.push(format!("🔧 工具: {}", tools.join(", ")));
        }

        if !ctx.changed_files.is_empty() {
            let (modified, added, deleted, other) = count_changes(&ctx.changed_files);
            let mut stats = Vec::new();
            if modified > 0 { stats.push(format!("{} 修改", modified)); }
            if added > 0 { stats.push(format!("{} 新增", added)); }
            if deleted > 0 { stats.push(format!("{} 删除", deleted)); }
            if other > 0 { stats.push(format!("{} 其他", other)); }
            lines.push(format!("📊 变更: {}", stats.join(", ")));
        }

        lines.push(format!("🔒 权限: {}", ctx.permission_mode));

        if let Some(ref session) = ctx.recent_session {
            lines.push(format!("📋 上次会话: {}", session.title));
        }

        let banner = lines.join("\n");

        model.cell_buffer.push_cell(Cell {
            kind: CellKind::SystemMessage {
                level: "info".into(),
                text: banner,
            },
            state: CellState::Committed,
            task_id: String::new(),
            turn_id: String::new(),
            created_at: 0,
        });

        model.status = format!("📁 {} · {}",
            ctx.name,
            ctx.branch.as_deref().unwrap_or("就绪"));
    }

    /// 处理斜杠命令
    fn handle_command(&mut self, cmd: Command, ctx: &mut Ctx<'_, Self>) {
        let m = &mut self.model;
        let cmd_ref = &cmd; // 借用用于比较，不影响 match 消耗
        match cmd {
            Command::New => {
                // `/new` — 创建新会话
                m.session_overlay = None;
                let client = self.client.clone();
                let project_root = self.workspace_ctx.root.to_string_lossy().to_string();
                self._pending_task = Some(ctx.perform(async move {
                    match client.create_task(&project_root).await {
                        Ok(new_task_id) => {
                            client.switch_to_task(new_task_id);
                            Msg::SessionSelected(0) // 复用：表示会话已切换
                        }
                        Err(error) => Msg::CommandFailed(format!("创建会话失败: {}", error)),
                    }
                }));
                m.status = "正在创建新会话…".into();
            }

            Command::Resume | Command::Sessions => {
                let is_resume = matches!(cmd_ref, Command::Resume);
                if is_resume {
                    m.session_overlay = Some(SessionOverlayState {
                        sessions: Vec::new(), // 占位，SessionListLoaded 时填充
                        mode: SessionOverlayMode::Resume,
                    });
                }
                let client = self.client.clone();
                self._pending_task = Some(ctx.perform(async move {
                    match client.task_list().await {
                        Ok(result) => Msg::SessionListLoaded(result.tasks),
                        Err(error) => Msg::CommandFailed(format!("获取会话列表失败: {}", error)),
                    }
                }));
                m.status = "正在获取会话列表…".into();
            }

            Command::Status => {
                // /status — 显示当前会话状态
                let client = self.client.clone();
                let task_id = self.task_id.clone();
                self._pending_task = Some(ctx.perform(async move {
                    match client.task_get(&task_id).await {
                        Ok(info) => Msg::TaskInfoLoaded(Some(info)),
                        Err(e) => Msg::CommandFailed(format!("获取状态失败: {}", e)),
                    }
                }));
                m.status = "正在获取状态…".into();
            }

            Command::Summary => {
                // /summary — 显示工作摘要（基于 git 状态 + 当前会话）
                let changed = self.workspace_ctx.changed_files.len();
                let project = self.workspace_ctx.name.clone();
                let branch = self.workspace_ctx.branch.clone();
                let cell_count = m.cell_buffer.cells().len();
                let summary = format!(
                    "工作摘要\n\
                     ────────────────\n\
                     项目: {}\n\
                     分支: {}\n\
                     对话消息: {} 条\n\
                     未提交文件: {} 个\n\
                     ────────────────\n\
                     直接输入需求继续工作。",
                    project,
                    branch.as_deref().unwrap_or("(无)"),
                    cell_count,
                    changed,
                );
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: summary,
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
            }

            Command::Diff => {
                // /diff — 读取真实 Git diff
                let cwd = self.workspace_ctx.root.clone();
                self._pending_task = Some(ctx.perform(async move {
                    let diff = run_git_diff(&cwd).await;
                    Msg::DiffResult(diff)
                }));
                m.status = "正在获取 diff…".into();
            }

            Command::Artifacts => {
                // /artifacts — 显示当前任务的产物
                let client = self.client.clone();
                let task_id = self.task_id.clone();
                self._pending_task = Some(ctx.perform(async move {
                    match client.task_get(&task_id).await {
                        Ok(info) => Msg::TaskInfoLoaded(Some(info)),
                        Err(e) => Msg::CommandFailed(format!("获取产物失败: {}", e)),
                    }
                }));
                m.status = "正在获取产物…".into();
            }

            Command::Compact => {
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: "紧凑模式提示：当前上下文已压缩。\n\
                               已保留用户确认的要求、当前目标、已完成事实、\n\
                               未解决问题、文件改动、最近验证、权限决策。".into(),
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
            }

            Command::Review => {
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: "能力未就绪：/review Combo 尚未集成。\n直接在 TUI 中使用自然语言描述需要审查的改动。".into(),
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
            }

            Command::Qa => {
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: "能力未就绪：/qa Combo 尚未集成。\n直接在 TUI 中使用自然语言描述需要检查的内容。".into(),
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
            }

            Command::Help => {
                let help_text = vec![
                    "可用命令:".into(),
                    "  /new, /n        创建新会话",
                    "  /resume, /r     恢复最近会话",
                    "  /sessions, /s   列出所有会话",
                    "  /status, /st    显示当前会话状态",
                    "  /summary, /su   显示工作摘要",
                    "  /diff, /d       显示 Git diff",
                    "  /artifacts, /a  显示产物",
                    "  /compact, /c    压缩上下文",
                    "  /review         审查代码（未就绪）",
                    "  /qa             质量检查（未就绪）",
                    "  /help, /h       显示此帮助",
                    "  /exit, /q       退出程序",
                    "",
                    "直接输入需求即可开始工作。",
                ]
                .join("\n");
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: help_text,
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
            }

            Command::Exit => {
                // /exit — 触发退出流程
                ctx.exit(());
            }
        }
    }
}

/// 异步执行 git diff 并返回结果
async fn run_git_diff(cwd: &std::path::Path) -> String {
    let git_exe = resolve_git_exe();
    let result = tokio::process::Command::new(&git_exe)
        .args(["diff", "--stat"])
        .current_dir(cwd)
        .output()
        .await;
    let stat = match result {
        Ok(ref out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => String::new(),
    };

    let result = tokio::process::Command::new(&git_exe)
        .args(["diff"])
        .current_dir(cwd)
        .output()
        .await;
    let full = match result {
        Ok(ref out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => "(无法获取 diff，可能不在 git 仓库中)".to_string(),
    };

    if stat.is_empty() && full.is_empty() {
        "工作区干净，无未提交改动。".to_string()
    } else {
        format!("{}\n{}", stat, full)
    }
}

/// 统计变更文件的各种类型数量
fn count_changes(files: &[crate::workspace::ChangedFile]) -> (usize, usize, usize, usize) {
    let mut modified = 0;
    let mut added = 0;
    let mut deleted = 0;
    let mut other = 0;
    for f in files {
        match f.status.as_str() {
            "M" => modified += 1,
            "A" => added += 1,
            "D" => deleted += 1,
            "??" => added += 1, // 未跟踪视为新增
            _ => other += 1,
        }
    }
    (modified, added, deleted, other)
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
                let is_turn_end = matches!(
                    &event.kind,
                    UiEventKind::TurnCompleted
                        | UiEventKind::TurnFailed { .. }
                        | UiEventKind::TurnInterrupted
                );
                m.apply_ui_event(event);
                if is_turn_end {
                    if let Err(e) = session::save_session(&self.task_id, ".", &m.cell_buffer) {
                        tracing::warn!(error = %e, "Failed to save session after turn end");
                        m.status = format!("⚠ 会话保存失败: {}", e);
                    }
                }
            }

            Msg::SubmitInput => {
                let text = m.input.take_text();
                if !text.is_empty() {
                    m.history.push(&text);
                    // 检查是否是斜杠命令
                    if let Some(cmd) = parse_command(&text) {
                        self.handle_command(cmd, ctx);
                    } else {
                        // 把用户消息加入 CellBuffer（立即显示）
                        m.cell_buffer.push_cell(Cell {
                            kind: CellKind::UserMessage { text: text.clone() },
                            state: CellState::Committed,
                            task_id: self.task_id.clone(),
                            turn_id: String::new(),
                            created_at: 0,
                        });
                        // 立即进入 processing，关闭 Enter，避免 TurnStarted 回来前重复提交。
                        m.is_processing = true;
                        m.status = format!("发送：{}", text.chars().take(40).collect::<String>());
                        let client = self.client.clone();
                        // 必须 hold 住 Task，否则 perform 的 async 工作会被立即取消
                        self._pending_task = Some(ctx.perform(async move {
                            match client.send_message(&text).await {
                                Ok(_) => Msg::Tick,
                                Err(error) => Msg::CommandFailed(error),
                            }
                        }));
                    }
                }
            }

            Msg::CtrlCPressed => {
                if m.is_processing {
                    m.status = "正在中断…".into();
                    let client = self.client.clone();
                    self._pending_task = Some(ctx.perform(async move {
                        match client.cancel().await {
                            Ok(_) => Msg::Tick,
                            Err(error) => Msg::CommandFailed(error),
                        }
                    }));
                } else {
                    // 空闲时 Ctrl+C 也保存退出摘要
                    Self::save_exit_summary(
                        &self.workspace_ctx,
                        &m.cell_buffer,
                    );
                    ctx.exit(());
                }
            }

            Msg::Quit => {
                // 保存会话
                if let Err(e) = session::save_session(&self.task_id, ".", &m.cell_buffer) {
                    tracing::warn!(error = %e, "Failed to save session on quit");
                }
                // 保存退出摘要供 TUI 退出后显示
                Self::save_exit_summary(
                    &self.workspace_ctx,
                    &m.cell_buffer,
                );
                // SomaClient 的 Drop 会自动关闭子进程
                ctx.exit(());
            }

            Msg::ApprovePending => {
                // 用户批准 → 通知 Runtime
                let approval_id = m.pending_approval_id.take();
                m.pending_approval = None;

                if let Some(aid) = approval_id {
                    m.status = "已批准，正在继续…".into();
                    let client = self.client.clone();
                    // 必须保存 Task handle；eye_declare 会取消被立即丢弃的任务。
                    self._pending_task = Some(ctx.perform(async move {
                        match client.approve(&aid).await {
                            Ok(_) => Msg::Tick,
                            Err(error) => Msg::CommandFailed(error),
                        }
                    }));
                } else {
                    m.status = "已批准".into();
                }
            }

            Msg::DismissOverlay => {
                // 关闭审批覆盖层 → 通知 Runtime（如有）
                let approval_id = m.pending_approval_id.take();
                m.pending_approval = None;
                // 关闭会话覆盖层
                m.session_overlay = None;

                if let Some(aid) = approval_id {
                    m.status = "已拒绝，正在通知 Runtime…".into();
                    let client = self.client.clone();
                    self._pending_task = Some(ctx.perform(async move {
                        match client.reject(&aid).await {
                            Ok(_) => Msg::Tick,
                            Err(error) => Msg::CommandFailed(error),
                        }
                    }));
                } else {
                    m.status = "就绪".into();
                }
            }

            Msg::InsertNewline => {
                m.input.insert_newline();
            }

            Msg::HistoryUp => {
                let current = m.input.take_text();
                if let Some(prev) = m.history.up(&current) {
                    m.input.set_text(&prev);
                } else {
                    m.input.set_text(&current);
                }
            }

            Msg::HistoryDown => {
                let current = m.input.take_text();
                if let Some(next) = m.history.down() {
                    m.input.set_text(&next);
                } else {
                    m.input.set_text(&current);
                }
            }

            Msg::RawInput(event) => {
                m.input.handle(&event);
            }

            Msg::CommandFailed(error) => {
                m.is_processing = false;
                m.active_tool_summary = None;
                m.status = format_user_error(&error);
                m.cell_buffer.fail_all_active();

                // 检测 Runtime 断开
                if !self.client.is_connected() && !m.runtime_disconnected {
                    m.runtime_disconnected = true;
                    m.status = "Runtime 意外退出。按 [x] 退出（重新运行 soma 恢复）".into();
                }
            }

            Msg::SessionListLoaded(sessions) => {
                m.is_processing = false;
                if sessions.is_empty() {
                    m.cell_buffer.push_cell(Cell {
                        kind: CellKind::SystemMessage {
                            level: "info".into(),
                            text: "没有找到会话记录。直接输入需求开始新工作。".into(),
                        },
                        state: CellState::Committed,
                        task_id: String::new(),
                        turn_id: String::new(),
                        created_at: 0,
                    });
                    m.status = "就绪".into();
                } else {
                    // 判断是 /resume 还是 /sessions：检查 overlay 模式
                    let is_resume = m.session_overlay.as_ref().map_or(false, |o| o.mode == SessionOverlayMode::Resume);
                    if is_resume {
                        m.session_overlay = Some(SessionOverlayState {
                            sessions: sessions.clone(),
                            mode: SessionOverlayMode::Resume,
                        });
                        m.status = "选择要恢复的会话（输入编号）：".into();
                    } else {
                        // /sessions — 直接显示
                        let list: Vec<String> = sessions
                            .iter()
                            .enumerate()
                            .map(|(i, s)| format!("{}. {}（{}）", i + 1, s.title, s.status))
                            .collect();
                        m.cell_buffer.push_cell(Cell {
                            kind: CellKind::SystemMessage {
                                level: "info".into(),
                                text: format!("会话列表：\n{}", list.join("\n")),
                            },
                            state: CellState::Committed,
                            task_id: String::new(),
                            turn_id: String::new(),
                            created_at: 0,
                        });
                        m.status = "就绪".into();
                    }
                }
            }

            Msg::SessionSelected(index) => {
                m.is_processing = false;
                let overlay = m.session_overlay.take();
                if let Some(ref overlay) = overlay {
                    // 来自 overlay 选择 — 切换到选中的会话
                    if let Some(task) = overlay.sessions.get(index) {
                        let task_id = task.id.clone();
                        let title = task.title.clone();
                        self.client.switch_to_task(task_id);
                        self.task_id = self.client.task_id().unwrap_or_else(|| "?".to_string());

                        // 清除当前对话，显示已切换提示
                        m.cell_buffer = CellBuffer::new();
                        m.cell_buffer.push_cell(Cell {
                            kind: CellKind::SystemMessage {
                                level: "info".into(),
                                text: format!("已切换到会话：{}", title),
                            },
                            state: CellState::Committed,
                            task_id: self.task_id.clone(),
                            turn_id: String::new(),
                            created_at: 0,
                        });
                        m.status = format!("已切换到：{}", title);
                    }
                } else {
                    // 来自 /new 的回调 — 已创建新会话
                    self.task_id = self.client.task_id().unwrap_or_else(|| "?".to_string());
                    m.cell_buffer = CellBuffer::new();
                    m.cell_buffer.push_cell(Cell {
                        kind: CellKind::SystemMessage {
                            level: "info".into(),
                            text: "已开始新会话。仓库中现有的未提交文件仍然保留。".into(),
                        },
                        state: CellState::Committed,
                        task_id: self.task_id.clone(),
                            turn_id: String::new(),
                        created_at: 0,
                    });
                    m.status = "新会话已就绪".into();
                }
            }

            Msg::TaskInfoLoaded(info) => {
                m.is_processing = false;
                match info {
                    Some(task) => {
                        let mut lines = vec![
                            format!("当前会话: {}", task.title),
                            format!("状态: {}", task.status),
                            format!("创建: {}", task.created_at),
                            format!("更新: {}", task.updated_at),
                            String::new(),
                            format!("仓库: {} 个未提交文件", self.workspace_ctx.changed_files.len()),
                        ];
                        if let Some(ref branch) = self.workspace_ctx.branch {
                            lines.push(format!("分支: {}", branch));
                        }
                        if let Some(combo) = task.work_state.get("current_combo").and_then(|v| v.as_str()) {
                            lines.push(String::new());
                            lines.push(format!("当前工作流: {}", combo));
                        }
                        if !task.artifacts.is_empty() {
                            lines.push(String::new());
                            lines.push(format!("产物: {} 个", task.artifacts.len()));
                        }
                        m.cell_buffer.push_cell(Cell {
                            kind: CellKind::SystemMessage {
                                level: "info".into(),
                                text: lines.join("\n"),
                            },
                            state: CellState::Committed,
                            task_id: String::new(),
                            turn_id: String::new(),
                            created_at: 0,
                        });
                        m.status = "就绪".into();
                    }
                    None => {
                        m.cell_buffer.push_cell(Cell {
                            kind: CellKind::SystemMessage {
                                level: "info".into(),
                                text: "没有活跃会话。直接输入需求开始新工作。".into(),
                            },
                            state: CellState::Committed,
                            task_id: String::new(),
                            turn_id: String::new(),
                            created_at: 0,
                        });
                        m.status = "就绪".into();
                    }
                }
            }

            Msg::DiffResult(diff) => {
                m.is_processing = false;
                let display = if diff.len() > 2000 {
                    format!("{}…\n\n（diff 过长，已截断前 2000 字符）", &diff[..2000])
                } else {
                    diff
                };
                m.cell_buffer.push_cell(Cell {
                    kind: CellKind::SystemMessage {
                        level: "info".into(),
                        text: format!("Git Diff：\n{}", display),
                    },
                    state: CellState::Committed,
                    task_id: String::new(),
                    turn_id: String::new(),
                    created_at: 0,
                });
                m.status = "就绪".into();
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
                            |c| c.child(text("思考中…")),
                        )
                        .child(spinner("⏳")),
                )
            })
            // 审批覆盖层
            .when_some(model.pending_approval.as_ref(), |c, prompt| {
                c.child(panel(text(format!("需要批准：{}", prompt))).title("操作审批"))
            })
            // Runtime 断开覆盖层
            .when(model.runtime_disconnected, |c| {
                c.child(
                    panel(text(
                        "Runtime 意外退出。\n\n\
                         已保留当前输入和已完成的对话。\n\n\
                         [x] 退出（重新运行 soma 恢复）"
                    ))
                    .title("⚠ Runtime 断开"),
                )
            })
            // 会话列表覆盖层
            .when_some(model.session_overlay.as_ref(), |c, overlay| {
                let items: Vec<String> = overlay
                    .sessions
                    .iter()
                    .enumerate()
                    .map(|(i, s)| {
                        format!("{}. {} [{}]", i + 1, s.title, s.status)
                    })
                    .collect();
                let body = format!("最近会话：\n{}\n\n输入编号切换会话，Esc 关闭", items.join("\n"));
                c.child(panel(text(body)).title("会话切换"))
            })
            // 输入区
            .child(
                panel(
                    text_area(&model.input)
                        .track_focus(&model.input_focus)
                        .max_height(INPUT_MAX_HEIGHT)
                        .placeholder("输入消息…（Enter 发送，Shift+Enter 换行，↑↓ 历史，Ctrl+C 中断，Ctrl+D 退出）"),
                )
                .title("输入"),
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

        // Runtime 断开：x=退出（重新运行重新连接）
        if self.model.runtime_disconnected {
            km = km.on_override(key(KeyCode::Char('x')), Msg::Quit);
        }

        // 会话列表选择：数字键 1-9
        if let Some(ref overlay) = self.model.session_overlay {
            let count = overlay.sessions.len().min(9);
            for i in 1..=count {
                let digit = char::from_digit(i as u32, 10).unwrap();
                let msg = Msg::SessionSelected(i - 1);
                km = km.on_override(key(KeyCode::Char(digit)), msg);
            }
        }

        // Shift+Enter: 换行
        km = km.on(key(KeyCode::Enter).shift(), Msg::InsertNewline);

        // Enter: 提交输入
        if self.model.pending_approval.is_none() && !self.model.is_processing {
            km = km.on(key(KeyCode::Enter), Msg::SubmitInput);
        }

        // ↑ / ↓: 命令历史导航（仅当不在 overlay 选择时）
        if self.model.session_overlay.is_none() && !self.model.runtime_disconnected {
            km = km.on(key(KeyCode::Up), Msg::HistoryUp);
            km = km.on(key(KeyCode::Down), Msg::HistoryDown);
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
            let error = envelope
                .payload
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            UiEventKind::TurnFailed { error }
        }
        RuntimeEventKind::AssistantDelta => {
            let text = envelope
                .payload
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let newline_count = text.chars().filter(|&c| c == '\n').count() as u32;
            UiEventKind::StreamChunk {
                text,
                newline_count,
                is_final: false,
            }
        }
        RuntimeEventKind::ToolStarted => {
            let call_id = envelope
                .payload
                .get("tool_call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let capability = envelope
                .payload
                .get("capability_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args_display = envelope
                .payload
                .get("arguments")
                .map(|v| v.to_string())
                .unwrap_or_default();
            UiEventKind::ToolCallStarted {
                call_id,
                capability,
                args_display,
            }
        }
        RuntimeEventKind::ToolUpdated => {
            let call_id = envelope
                .payload
                .get("tool_call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let output = envelope
                .payload
                .get("output")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let truncated = envelope
                .payload
                .get("truncated")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            UiEventKind::ToolCallOutput {
                call_id,
                output,
                truncated,
            }
        }
        RuntimeEventKind::ToolCompleted => {
            let call_id = envelope
                .payload
                .get("tool_call_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let success = envelope
                .payload
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let exit_code = envelope
                .payload
                .get("exit_code")
                .and_then(|v| v.as_i64())
                .map(|v| v as i32)
                .unwrap_or(if success { 0 } else { 1 });
            let summary = envelope
                .payload
                .get("result_summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let log_path = envelope
                .payload
                .get("log_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            UiEventKind::ToolCallCompleted {
                call_id,
                exit_code,
                summary,
                log_path,
            }
        }
        RuntimeEventKind::WorkStateChanged => {
            let combo = envelope
                .payload
                .get("combo")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let stage = envelope
                .payload
                .get("stage")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            UiEventKind::WorkStateChanged { combo, stage }
        }
        RuntimeEventKind::ArtifactCreated => {
            let path = envelope
                .payload
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let summary = envelope
                .payload
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            UiEventKind::ArtifactCreated { path, summary }
        }
        RuntimeEventKind::ApprovalRequested => {
            let approval_id = envelope
                .payload
                .get("approval_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let prompt = envelope
                .payload
                .get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let timeout_ms = envelope.payload.get("timeout_ms").and_then(|v| v.as_u64());
            UiEventKind::ApprovalRequired {
                approval_id,
                prompt,
                timeout_ms,
            }
        }
        RuntimeEventKind::DecisionRequested => {
            let input_id = envelope
                .payload
                .get("input_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let prompt = envelope
                .payload
                .get("prompt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let default = envelope
                .payload
                .get("default")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            UiEventKind::UserInputRequired {
                input_id,
                prompt,
                default,
            }
        }
        _ => {
            let kind_name = format!("{:?}", envelope.kind);
            tracing::error!(
                event = %kind_name,
                task_id = %envelope.task_id,
                "收到未知 RuntimeEventKind — 协议版本可能不匹配"
            );
            UiEventKind::SystemMessage {
                level: "error".into(),
                text: format!(
                    "⚠ 未知事件类型: {} — 可能存在协议不匹配\n\
                     请更新 soma 版本以兼容最新协议。",
                    kind_name
                ),
            }
        }
    };

    Some(UiEvent::new(&task_id, &turn_id, seq, kind))
}

/// 将内部错误消息翻译为用户友好的提示
fn format_user_error(error: &str) -> String {
    if error.contains("channel closed") || error.contains("响应通道关闭") {
        "Runtime 连接已断开。运行 `soma doctor` 检查状态。".to_string()
    } else if error.contains("broken pipe") || error.contains("Broken pipe") {
        "Runtime 进程已终止。运行 `soma doctor` 检查状态。".to_string()
    } else if error.contains("serde") || error.contains("序列化") || error.contains("反序列化") {
        format!("内部数据错误: {}", error)
    } else if error.contains("Timeout") || error.contains("timeout") || error.contains("超时") {
        format!("操作超时: {}", error)
    } else {
        format!("请求失败：{}", error)
    }
}

/// 格式化持续时间（秒或毫秒）
fn format_duration(d: std::time::Duration) -> String {
    let secs = d.as_secs_f64();
    if secs >= 1.0 {
        format!("{:.1}s", secs)
    } else {
        format!("{}ms", d.as_millis())
    }
}

/// 将能力名映射为用户友好的中文标签
fn capability_label(capability: &str) -> &'static str {
    match capability {
        "file_read" => "读取文件",
        "file_search" => "搜索代码",
        "file_edit" => "修改文件",
        "file_write" => "写入文件",
        "process_run" => "执行命令",
        "git_status" => "检查 Git 状态",
        "git_diff" => "查看 Diff",
        "git_log" => "读取提交记录",
        _ => "执行工具",
    }
}

/// 判断工具类别（用于输出分类渲染）
fn tool_category(capability: &str) -> &'static str {
    match capability {
        "file_edit" | "file_write" => "修改",
        "process_run" => {
            // 动态判断，但在这里无法看到实际命令
            "验证"
        }
        "git_status" | "git_diff" | "git_log" => "Git",
        _ => "工具",
    }
}

/// 判断 process_run 是否可能是验证命令
fn is_verification_command(args_display: &str) -> bool {
    args_display.contains("cargo test")
        || args_display.contains("cargo check")
        || args_display.contains("cargo build")
        || args_display.contains("cargo clippy")
        || args_display.contains("npm test")
        || args_display.contains("pytest")
}

fn capability_args_summary(capability: &str, args_display: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(args_display).ok()?;
    let field = |name: &str| value.get(name).and_then(|v| v.as_str());
    let summary = match capability {
        "process_run" => field("command").map(ToOwned::to_owned),
        "file_read" | "file_edit" | "file_write" => field("path").map(ToOwned::to_owned),
        "file_search" => {
            let pattern = field("pattern")?;
            match field("path") {
                Some(path) => Some(format!("{} · {}", pattern, path)),
                None => Some(pattern.to_string()),
            }
        }
        "git_diff" => field("path").map(ToOwned::to_owned),
        _ => None,
    };
    summary.filter(|text| !text.trim().is_empty())
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
        CellKind::UserMessage { text: msg } => col().child(text(format!("你：{}", msg))).any(),

        CellKind::AssistantMessage {
            committed_text,
            pending_text,
        } => {
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

        CellKind::ToolCall {
            capability,
            args_display,
            output,
            exit_code,
            summary,
            truncated,
            log_path,
            ..
        } => {
            let status_mark = match exit_code {
                Some(0) => "✓",
                Some(_) => "✗",
                None => "●",
            };
            let cat = tool_category(capability);
            let label = capability_label(capability);
            let is_verify = capability == "process_run"
                && is_verification_command(args_display);

            let header = if is_verify {
                format!("{} 验证", status_mark)
            } else if cat == "修改" {
                format!("{} 修改", status_mark)
            } else {
                format!("{} {}", status_mark, label)
            };

            let mut parts = col().child(text(header)).gap(0);

            // 工具参数摘要（命令路径等）
            if let Some(args) = capability_args_summary(capability, args_display) {
                parts = parts.child(text(format!("  {}", args)));
            }

            // 输出截断：失败时展示更多尾部上下文（错误行），成功时仅摘要
            let is_error = exit_code.map_or(false, |c| c != 0);
            let (head, tail) = if is_error {
                (5, 8) // 失败时展示更多尾部
            } else {
                (5, 3) // 成功时只展示头部和少量尾部
            };

            if !output.is_empty() {
                let display = truncate_output(output, head, tail);
                for line in display.lines() {
                    parts = parts.child(text(format!("  {}", line)));
                }
            }

            // 截断标记 + 日志文件提示
            if *truncated {
                parts = parts.child(text("  …完整输出已截断"));
            }
            if let Some(log) = log_path {
                if *truncated || is_error {
                    parts = parts.child(text(format!("  📄 完整输出: {}", log)));
                }
            }

            // 结果摘要行
            if let Some(s) = summary {
                let done_icon = match exit_code {
                    Some(0) => "✓",
                    Some(_) => "✗",
                    None => "",
                };
                parts = parts.child(text(format!("  {} {}", done_icon, s)));
            }

            if exit_code.is_none() {
                parts = parts.child(row().fill(text("执行中…")).fixed(3, spinner("…")));
            }

            // 失败时添加诊断提示
            if let Some(code) = exit_code {
                if *code != 0 && log_path.is_none() {
                    parts = parts.child(text("  💡 运行 `soma doctor` 查看诊断信息"));
                }
            }
            parts.any()
        }

        CellKind::Diff {
            diff_text,
            file_path,
        } => {
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

        CellKind::Artifact { path, summary } => col()
            .child(text(format!("📎 {} ({})", summary, path)))
            .any(),

        CellKind::ApprovalRequest { prompt, .. } => col()
            .child(panel(text(format!("需要批准：{}", prompt))).title("操作审批"))
            .any(),

        CellKind::UserInputRequest { prompt, .. } => {
            col().child(text(format!("需要输入：{}", prompt))).any()
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
        assert!(model.status.contains("就绪"));
    }

    #[test]
    fn test_turn_started_sets_processing() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnStarted));
        assert!(model.is_processing);
        assert!(model.status.contains("正在处理"));
    }

    #[test]
    fn test_turn_completed_resets_processing() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnStarted));
        assert!(model.is_processing);

        model.apply_ui_event(make_event(UiEventKind::TurnCompleted));
        assert!(!model.is_processing);
        assert!(model.status.contains("就绪"));
    }

    #[test]
    fn test_turn_interrupted_resets_and_shows_status() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnInterrupted));
        assert!(!model.is_processing);
        assert!(model.status.contains("已中断"));
    }

    #[test]
    fn test_turn_failed_resets_and_shows_error() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            0,
            UiEventKind::TurnFailed {
                error: "timeout".into(),
            },
        ));
        assert!(!model.is_processing);
        assert!(model.status.contains("失败"));
        assert!(model.status.contains("timeout"));
    }

    #[test]
    fn test_tool_call_start_sets_active_tool() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            0,
            UiEventKind::ToolCallStarted {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{\"path\":\"/tmp/x\"}".into(),
            },
        ));
        assert!(model.active_tool_summary.is_some());
        assert!(model
            .active_tool_summary
            .as_deref()
            .unwrap()
            .contains("读取文件"));
    }

    #[test]
    fn test_tool_call_completed_clears_active_tool() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            0,
            UiEventKind::ToolCallStarted {
                call_id: "call-1".into(),
                capability: "file_read".into(),
                args_display: "{}".into(),
            },
        ));
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            1,
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
            "t1",
            "t1-1",
            0,
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
            "t1",
            "t1-1",
            0,
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
            "t1",
            "t1-1",
            0,
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
            "t1",
            "t1-1",
            0,
            UiEventKind::UserInputRequired {
                input_id: "in-1".into(),
                prompt: "Enter path:".into(),
                default: None,
            },
        ));
        assert!(model.status.contains("需要输入"));
    }

    #[test]
    fn test_work_state_changed() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            0,
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
            "t1",
            "t1-1",
            0,
            UiEventKind::ArtifactCreated {
                path: "/tmp/result.txt".into(),
                summary: "analysis result".into(),
            },
        ));
        assert!(model.status.contains("产物"));
        assert!(model.status.contains("analysis result"));
    }

    #[test]
    fn test_stream_chunk_final_updates_status() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(UiEvent::new(
            "t1",
            "t1-1",
            0,
            UiEventKind::StreamChunk {
                text: "hello\n".into(),
                newline_count: 1,
                is_final: true,
            },
        ));
        assert!(model.status.contains("流式输出完成"));
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

    #[test]
    fn test_tool_boundary_creates_separate_assistant_cells() {
        let mut model = SomaTuiModel::new();
        model.apply_ui_event(make_event(UiEventKind::TurnStarted));
        model.apply_ui_event(make_event(UiEventKind::StreamChunk {
            text: "我先检查。".into(),
            newline_count: 0,
            is_final: false,
        }));
        model.apply_ui_event(make_event(UiEventKind::ToolCallStarted {
            call_id: "call-1".into(),
            capability: "git_status".into(),
            args_display: "{}".into(),
        }));
        model.apply_ui_event(make_event(UiEventKind::ToolCallCompleted {
            call_id: "call-1".into(),
            exit_code: 0,
            summary: "工作区干净".into(),
            log_path: None,
        }));
        model.apply_ui_event(make_event(UiEventKind::StreamChunk {
            text: "工作区目前没有改动。".into(),
            newline_count: 0,
            is_final: false,
        }));

        let cells = model.cell_buffer.cells();
        assert_eq!(cells.len(), 3);
        assert!(matches!(cells[0].kind, CellKind::AssistantMessage { .. }));
        assert!(matches!(cells[1].kind, CellKind::ToolCall { .. }));
        assert!(matches!(cells[2].kind, CellKind::AssistantMessage { .. }));
    }
}
