# SomaOS Handoff — 2026-07-25 (Session 2)

> **会话终点:** HTTP 模式完成 + CLI 修复 + Spike 调研完成 + 架构路线确认
> **下一目标:** 基于 Ratatui 构建 SomaOS TUI，以 Codex TUI 为参考

---

## 项目状态

```
0.2  执行内核                    ✅
0.3  Review Combo               ✅
0.5  Investigate → Fix → Review ✅
0.7  项目接管与连续性             ✅
0.8  完整研发主链（A-E）          ✅
0.85 Softill 开放与生长（A-C）    ✅
0.9  Desktop 地基                ⬜ 当前推进中（方向修正）
1.0  日常可用                    ⬜
```

## 本轮完成

### 基础设施

| 组件 | 状态 | 说明 |
|------|------|------|
| **EventSink → notification 适配** | ✅ | `NotificationEventSink` 将 RuntimeEventEnvelope 写为 `task/event` notification |
| **TurnEngine 连入 task/send_message** | ✅ | `run_task_turn()` 异步执行，流式事件通过 EventSink 推送 |
| **TaskManager** | ✅ | `complete_turn()`/`fail_turn()`/`active_turn_id()` 方法 |
| **集成测试** | ✅ | `soma-runtime/tests/vertical_slice.rs` — E2E AI 执行 + 取消 |
| **前端测试 (vitest)** | ✅ | 19 tests (eventReducer + Conversation + Composer) |
| **TESTING.md** | ✅ | 测试体系文档 |

### HTTP 模式（新）

| 组件 | 状态 | 说明 |
|------|------|------|
| `soma-runtime --http PORT` | ✅ | axum HTTP 服务器 |
| `POST /api` | ✅ | JSON-RPC 处理器（复用 --stdio handler） |
| `GET /api/events` | ✅ | SSE 事件流（broadcast channel） |
| `BroadcastNotificationSink` | ✅ | 同时写 stdout + broadcast |
| 前端 `commands.ts` → fetch | ✅ | 从 Tauri invoke 改为 HTTP POST |
| 前端 `events.ts` → EventSource | ✅ | 从 Tauri event 改为 SSE |
| 前端 build (`soma-desktop/dist/`) | ✅ | Vite build 生产包 |

### CLI 修复

| 组件 | 状态 | 说明 |
|------|------|------|
| `soma-client send_request` | ✅ | 自动跳过中间通知，等匹配 id 的响应 |
| `soma-cli investigate` | ✅ | 从旧 case/run 协议改为 task 协议 |
| 流式事件显示 | ✅ | AssistantDelta 实时打印 |

### Design Tokens

| 组件 | 状态 | 说明 |
|------|------|------|
| Figma API 提取 | ✅ | 从 "Spatial Workbench" 提取精确色值 |
| `.gstack/design-tokens.md` | ✅ | 存档设计 tokens |
| CSS 更新 | ✅ | 全部 8 色值 + typography 层级 + 布局 |

### 前端页面（Figma 对齐，部分假数据）

| 页面 | 状态 | 后端连接 |
|------|------|---------|
| Home (Mode Grid + Hero + Recent) | ✅ | ❌ 假数据 |
| Workspace (Conversation + Composer) | ✅ | ✅ 真实对话 |
| Task Summary Drawer | ✅ | ❌ 假数据 |
| Changes Diff View | ✅ | ❌ 假数据 |
| Sidebar (Quick Nav + Project) | ✅ | ⚠️ 任务列表真实，导航假的 |

### Codex CLI 深度调研

完成了 Codex CLI 架构调研：

- **代码**: `soma-cli-spike/codex/`（完整 clone，Apache 2.0）
- **结构**: 80+ Rust crates，核心在 `codex-rs/app-server/`
- **关键抽象**:
  - `ModelProvider` trait — 已有 chatgpt/ollama/lmstudio 三种实现
  - `HttpTransport` trait — HTTP 调用抽象（`ReqwestTransport` 实现）
  - `ResponsesClient::stream_request()` — 实际的 AI 调用入口
- **耦合**: 使用 OpenAI Responses API 格式，不兼容 Soma 协议

## 关键架构决策（最后达成的共识）

### 最终路线

```
Ratatui (渲染底座)
    ↓ 调 soma-client
soma-client (JSON-RPC)
    ↓
soma-runtime (AI 执行)
    ├── EventSink → SSE/stdio
    ├── TaskManager
    ├── WorkState / Artifact
    └── Combo / Softill
```

### 决策理由

1. **不 fork Codex CLI** — 其架构深度耦合 OpenAI Responses API，替换成本高于自建
2. **不重新造终端基建** — Ratatui 提供输入编辑、渲染循环、键盘事件等成熟组件
3. **参考 Codex TUI** — 看它的交互模式、组件拆分、事件循环结构，选择性移植
4. **Soma Runtime 是核心价值** — Task、Combo、WorkState、Artifact、Findings 是自己的

### 被否定的方案

- ~~直接继承 `soma-cli` 加 REPL~~ — 体验追不上 Claude Code / Codex
- ~~fork Codex CLI 换 provider~~ — Responses API 深度耦合
- ~~继续 React + Tauri 桌面~~ — 这个环境不可测，且用户首选 CLI
- ~~ShellGPT adapter~~ — Python sidecar 长期不如 Rust 原生

## 已知缺口（待推进）

### P0 — TUI 最小可行

```
[ ] 基于 Ratatui 创建 soma-tui crate
[ ] 参考 Codex TUI (codex-rs/tui/) 的组件结构
[ ] 输入行 + 对话历史 + 流式输出显示
[ ] 通过 soma-client 连接 runtime
[ ] AssistantDelta / ToolCall / TurnCompleted 事件展示
```

### P1 — TUI 功能完整

```
[ ] 多轮对话（同 task 内连续 send_message）
[ ] Ctrl+C 中断 → task/cancel
[ ] WorkState 展示
[ ] Artifact 展示
[ ] Findings 展示
[ ] 彩色 Markdown 输出
```

### P2 — 桌面/其他

```
[ ] Tauri 桌面打包（用现有 React 前端）
[ ] 编辑器集成（以后再说）
```

## 关键文件位置

```
soma-runtime/src/
├── main.rs                 # 双模式启动（--stdio / --http）
├── event_adapter.rs        # BroadcastNotificationSink
├── http_server.rs          # axum HTTP + SSE
├── task_manager.rs         # TaskManager (complete/fail/active_turn)
└── tests/vertical_slice.rs # E2E 集成测试

soma-client/src/
├── client.rs               # StdioClient (send_request 跳过通知)

soma-cli/src/
└── main.rs                 # CLI (investigate 用 task 协议)

soma-desktop/
├── src/
│   ├── App.tsx             # 多页面路由（Home/Workspace/Changes）
│   ├── pages/              # 页面组件
│   ├── features/           # Conversation / Composer / TaskSidebar
│   ├── runtime/
│   │   ├── commands.ts     # HTTP fetch
│   │   ├── events.ts       # SSE EventSource
│   │   └── eventReducer.ts # 事件→状态归约
│   └── app/styles.css      # 真实 Figma design tokens
└── dist/                   # 构建产物（可直接 serve）

soma-cli-spike/
└── codex/                  # Codex CLI 完整 clone（参考用）

.gstack/
├── design-tokens.md        # Figma 设计 token 存档
└── desktop-0.9-*.md        # 设计文档

TESTING.md                  # 测试体系文档
```

## 测试状态

```
全 workspace: ~200 passed ✅
├─ soma-core:     129 ✅
├─ soma-protocol:  14 ✅
├─ soma-runtime:   13 + 2 integration ✅
├─ soma-desktop:   19 vitest ✅
└─ 其他:           ~30 ✅
```

## 下次启动

1. 读本 HANDOFF.md 恢复上下文
2. 安装 Ratatui (`cargo add ratatui`)
3. 创建 `soma-tui/` crate
4. 参考 `codex-rs/tui/` 的组件结构
5. 实现最小交互循环：输入 → `soma-client` → 流式显示
6. 验收：`soma-tui` 启动 → 输入问题 → AI 流式回答 → 显示 ToolCall

## 本地配置（不提交）

```json
.somaos/env.json:
{
  "figma_token": "figd_...",
  "figma_file_key": "2ISwgYFvBb7QDEDbp3VIk9"
}
```

API key: `DEEPSEEK_API_KEY` 或 `ANTHROPIC_API_KEY`
