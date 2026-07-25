# SomaOS TUI 架构设计

> **阶段**：Spike / 方案 D（自建 TUI，不 fork Codex）
> **渲染底座**：eye_declare 0.6（timeline 架构）
> **协议**：soma-ui-protocol（结构化 UI 事件）
> **参考**：Codex TUI (codex-rs/tui/) Apache 2.0

---

## 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                    soma-tui (eye_declare App)                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Timeline（永久输出区域）                              │   │
│  │  ctx.push() 调用提交，不可逆                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │   │
│  │  │ User Msg │ │  AI 回复  │ │ Tool Call│ │System  │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tail（活跃区域 — 每帧重新渲染）                       │   │
│  │  ┌──────────────┐                                      │   │
│  │  │ StreamingCell│  (assistant delta 流式显示)           │   │
│  │  ├──────────────┤                                      │   │
│  │  │ ActiveTool   │  (工具调用原位更新)                    │   │
│  │  ├──────────────┤                                      │   │
│  │  │ Overlay      │  (审批/选择/用户输入)                  │   │
│  │  ├──────────────┤                                      │   │
│  │  │ InputBar     │  (文字输入区 + 状态行)                 │   │
│  │  └──────────────┘                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  SomaTuiModel (纯数据)                                       │
│  ├─ CellBuffer ← UiEvent 流                                  │
│  ├─ input_text / cursor_pos                                  │
│  ├─ pending_approval / awaiting_input                        │
│  └─ status / errors                                          │
│                                                              │
│  RuntimeClient ←→ soma-runtime (JSON-RPC stdio)              │
└──────────────────────────────────────────────────────────────┘
```

## 与 Codex TUI 的对比

| 概念 | Codex TUI | Soma TUI |
|------|-----------|----------|
| 渲染底座 | Ratatui (crossterm) | eye_declare 0.6 (on Ratatui) |
| 终端模式 | Alternate screen (默认) | Inline scrollback (默认) |
| Cell 抽象 | `HistoryCell` trait (含渲染) | `CellKind` enum (纯数据) |
| Cell 渲染 | 每个 cell 自包含 `display_lines()` | 集中式 `tail()` 投影 |
| 状态管理 | ChatWidget (自更新) | SomaTuiModel + eye_declare Elm |
| 事件来源 | InProcess AppServer | StdioClient over JSON-RPC |
| UI 事件 | codex-app-server-protocol | soma-ui-protocol (UiEvent) |
| 输入区 | ChatComposer | InputBar (eye_declare text_area) |
| 审批 | ApprovalOverlay (popup) | Overlay (eye_declare panel) |

## 提取的 Codex 模式

### 1. HistoryCell → CellBuffer

Codex 的 `transcript_cells: Vec<Arc<dyn HistoryCell>>` 管理所有可渲染单元。
每个 cell 必须实现：

```rust
trait HistoryCell {
    fn display_lines(&self, width: u16) -> Vec<Line<'static>>;
    fn desired_height(&self, width: u16) -> u16;
    fn transcript_lines(&self, width: u16) -> Vec<Line<'static>>;
}
```

Soma 的 `CellBuffer` 是纯数据版本：

```rust
struct CellBuffer {
    cells: Vec<Cell>,
}
// Cell = { kind: CellKind, state: CellState, ... }
// CellKind = enum { UserMessage, AssistantMessage, ToolCall, ... }
```

区别：渲染逻辑不在 Cell 中，在 TUI 的 `tail()` 函数中。

### 2. StreamState → 流式累积

Codex 的 `StreamState` 在 `streaming/mod.rs` 中：

```
MarkdownStreamCollector
  ├── buffer: String（累积原始 markdown delta）
  ├── committed_source_len（已提交行边界）
  └── commit_complete_source() → 返回新完成的 range

QueuedLine FIFO
  ├── line + enqueued_at
  └── drain_n() / step() 控制提交节奏
```

Soma 的对应：`CellKind::AssistantMessage` 中的 `pending_text` 和 `committed_text`。
Commit tick 由 eye_declare 的帧循环驱动。

### 3. ExecCell → ToolCall

Codex 的 `ExecCell` 模型：

```
ExecCell → Vec<ExecCall>
  ├── call_id, command, parsed (ParsedCommand)
  ├── output: Option<CommandOutput>
  │   ├── exit_code
  │   ├── aggregated_output (完成时)
  │   └── live_output: Option<LiveCommandOutput> (流式时)
  ├── start_time / duration
  └── source: ExecCommandSource

渲染（exec_cell/render.rs）：
  ├── activity_marker() → 动画指示器
  ├── output_lines() → head + tail + ellipsis
  └── truncate_lines_middle() → 视口行数感知截断
```

Soma 的对应：`CellKind::ToolCall` 用纯字段替代。

### 4. BottomPane → InputBar + Overlay

Codex 的 `BottomPane` 是复杂组件：

```
BottomPane
  ├── ChatComposer（输入）
  ├── ApprovalOverlay（审批弹窗）
  ├── ListSelectionView（选择列表）
  ├── RequestUserInputOverlay（用户输入）
  └── 分层输入路由：view → composer → interrupt
```

Soma 的简化：eye_declare 的 `panel(text_area())` 作为输入区，
`panel()` 覆盖层作为弹窗。

### 5. Markdown → eye_declare::markdown()

Codex 的 markdown 渲染管线：

```
codex_tui::markdown_stream.rs (newline-gated collector)
  → codex_tui::markdown_render.rs (pulldown-cmark + syntect)
  → codex_tui::markdown.rs (text formatting)
```

Soma 用 `eye_declare::markdown()` 组件 ——
eye_declare 0.6 内置 markdown 渲染（基于 pulldown-cmark + syntect）。

## spike 实施步骤

### Step 1: soma-ui-protocol ✅（已完成）

结构化 UI 事件类型。见 `soma-ui-protocol/src/`。

### Step 2: 渲染底座 → eye_declare 0.6

1. 在 `soma-tui/Cargo.toml` 中添加 eye_declare 依赖
2. 实现 `eye_declare::App` trait
3. 将 `CellBuffer` → `CellKind` 投影为 eye_declare Elements
4. 实现 InputBar（text_area + submit key binding）

### Step 3: Runtime 连接

1. 通过 `soma-client` 的 StdioClient 连接 soma-runtime
2. 发送 `task/create` → 获取 task_id
3. 发送 `task/send_message` → 开始对话
4. 从 stdout 读取 UiEvent JSON 行
5. 反序列化并 dispatch 到 SomaTuiModel

### Step 4: 核心交互

1. 流式输出显示（StreamChunk → AssistantMessage）
2. 工具调用原位更新（ToolCallStarted → ToolCallOutput → ToolCallCompleted）
3. Ctrl+C 中断（发送 Cancel UiCommand）
4. 输入区提交（发送 SubmitInput UiCommand）

### Step 5: 实验验证（之后决定是否落地 eye_declare）

1. 长输出截断 + 展开
2. Diff 显示
3. 审批流程
4. Windows resize
5. 跨会话恢复

---

## 关键文件

```
soma-ui-protocol/src/
├── lib.rs              # 模块导出
├── ui_event.rs         # UiEvent + UiEventKind + UiCommand
└── cell_buffer.rs      # CellBuffer + Cell + CellKind + CellState

soma-tui/src/
├── main.rs             # 入口（spike 阶段只打印架构信息）
├── lib.rs              # 库导出
├── adapter.rs          # Renderer trait + EyeDeclareRenderer
├── app.rs              # SomaTuiModel + SomaTuiApp (eye_declare App)
└── cells/
    └── mod.rs          # CellKind → RenderedCell 投影
```

## 参考

- Codex TUI: `soma-cli-spike/codex/codex-rs/tui/` (Apache 2.0)
- eye_declare: https://github.com/atuinsh/eye-declare (MIT)
- 本文件: `TUI-DESIGN.md`
