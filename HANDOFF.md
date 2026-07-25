# SomaOS Handoff — 2026-07-25 (Session 3)

> **会话终点:** Step 1-4 完成 + 零 warning + TUI 可运行
> **下一目标:** Step 5 实验验证（长输出截断、Diff、审批、跨会话恢复）

---

## 项目状态

### 里程碑

```
0.8  soma-ui-protocol    ✅  Step 1
0.85 渲染底座 + tail()   ✅  Step 2
0.9  Runtime 连接        ✅  Step 3
0.95 核心交互             ✅  Step 4
0.97 长输出截断            ✅  Step 5a
0.98 Diff 显示             ✅  Step 5b
1.0  日常可用             ⬜  Step 5 (审批/跨会话恢复)
```

### 测试

```
全 workspace: ~300+ passed ✅
├─ soma-ui-protocol:  10  ✅
├─ soma-tui:          31  ✅  (app:15 + cells:7 + runtime:9)
└─ 其他:             ~260 ✅
```

编译 warning: **soma-ui-protocol + soma-tui = 0**（其余旧 crate 共 20 个遗留 warning）

---

## 架构

```
soma-tui (eye_declare App)
  ├── RuntimeClient → soma-runtime --stdio (子进程)
  │   ├── send_message_fire_and_forget()  ← 用户输入
  │   ├── cancel_fire_and_forget()        ← Ctrl+C
  │   └── spawn_event_reader() → UiEvent 流
  │
  ├── SomaTuiModel
  │   ├── CellBuffer (committed + active cells)
  │   ├── TextAreaState (输入区)
  │   └── apply_ui_event() → CellBuffer 填充
  │
  └── tail() → eye_declare Elements
      ├── cells → markdown() / text() 渲染
      ├── spinner / overlay
      ├── input bar
      └── status line
```

---

## 创建的文件

```
soma-ui-protocol/                    (crate)
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── ui_event.rs      — UiEvent (15 kinds) + UiCommand
    └── cell_buffer.rs   — CellBuffer + Cell + CellKind + CellState

soma-tui/                           (crate)
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── main.rs          — driver_tokio::run_with() + Runtime init
    ├── app.rs           — SomaTuiApp + SomaTuiModel + render_cell_element
    ├── cells/mod.rs     — CellKind → 文本投影（参考实现 + 测试）
    └── runtime.rs       — RuntimeClient + 事件转换 + spawn_event_reader

TUI-DESIGN.md           架构设计文档
```

## 会话 3 变更摘要

- 创建 `soma-ui-protocol` crate（UiEvent 类型 + CellBuffer）
- 创建 `soma-tui` crate（eye_declare App + RuntimeClient）
- 实现 Runtime 连接（子进程管理、JSON-RPC、事件流）
- 实现 CellBuffer 接线（事件 → cell 填充）
- 实现 cells 渲染（markdown + tool call + 状态指示器）
- 清理死代码（adapter.rs 删除、未使用函数、零 warning）
- **41 测试全部通过 | 编译 warning = 0**

## 关键文件位置

```
soma-ui-protocol/src/
├── ui_event.rs           # 15 种 UiEventKind + CellBuffer 数据模型
├── cell_buffer.rs        # Cell 状态机 + 公共操作方法

soma-tui/src/
├── main.rs               # 异步入口 + Runtime 初始化
├── app.rs                # eye_declare::App impl + 状态机
│   ├── init()           → spawn 事件流
│   ├── update()         → 处理 Msg::UiEventReceived / SubmitInput / CtrlC
│   ├── tail()           → 渲染 CellBuffer + 输入区 + 状态
│   └── render_cell_element() → CellKind 投影为 Element
│
├── runtime.rs            # Runtime 子进程通信层
│   ├── RuntimeClient    → 进程管理 + 发送请求
│   ├── runtime_event_to_ui() → RuntimeEvent → UiEvent
│   └── spawn_event_reader() → 后台读取 stdout → mpsc channel
│
└── cells/mod.rs          # CellKind 投影参考（供测试验证）
```

## 启动方式

### 1. 配置 API key

在项目根目录创建 `.somaos/env.json`（不提交到 git）：

```json
{
  "deepseek_api_key": "sk-..."
}
```

或用环境变量：
```bash
export DEEPSEEK_API_KEY="sk-..."
```

支持 `deepseek_api_key`（DeepSeek）和 `anthropic_api_key`（Anthropic Claude）两种。

### 2. 运行

```bash
cd G:/AI/Claude-Workspace/Projects/SomaOS-Next
cargo run -p soma-tui
```

TUI 自动 spawn `soma-runtime --stdio` 子进程，创建 task 并显示输入界面。
按 Enter 提交输入，Ctrl+C 取消/退出，Ctrl+D 直接退出。
