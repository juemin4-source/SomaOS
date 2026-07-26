# DESIGN: Soma CLI Daily — 持久会话辅助

> 对应任务卡：TASK-SOMA-CLI-DAILY-001
> 基于 2026-07-26 office hours + eng review 决策

## 问题

用户在终端执行 `soma` 后，看到的是空白 TUI，不知道当前项目上下文、没有最近工作恢复、每次都要从头开始。用户目前仍在使用 Claude Code 而非 Soma。

## 目标窄楔子

用户进入任意代码仓库执行 `soma`，Soma 自动识别项目环境并恢复最近工作会话，可直接继续之前的工作。

## 架构决策

### 1. Workspace 检测时机

```
soma（无参数）
→ soma_tui::run()
  → detect_workspace(cwd)
  → App::new(workspace_context)
  → spawn runtime 子进程
  → 渲染启动摘要
  → 输入循环
```

检测放在 TUI 侧（`soma_tui::run()` 中），不在 CLI 侧。CLI 当前只做入口转发。

### 2. WorkspaceContext 位置

放在 `soma-tui/src/workspace/` 目录下，暂不抽独立 crate：

```
soma-tui/src/workspace/
├── mod.rs
├── context.rs    # WorkspaceContext 类型
└── detect.rs     # detect_workspace() 实现
```

等 Desktop 或其他客户端确实需要复用时，再提取为 `soma-workspace` crate。

### 3. CLI 职责

```
soma                     → 交互模式（委托 soma_tui::run）
soma investigate <q>     → CLI 模式（已有）
soma doctor              → 诊断（未来）
```

不解析 --cwd / --permission-mode 等启动参数，等出现实际需求再升级为 InteractiveLaunchContext。

## WorkspaceContext

```rust
pub struct WorkspaceContext {
    pub root: PathBuf,
    pub name: String,
    pub git_root: Option<PathBuf>,
    pub branch: Option<String>,
    pub changed_files: Vec<ChangedFile>,
    pub project_kinds: Vec<ProjectKind>,
    pub build_tools: Vec<BuildTool>,
    pub permission_mode: PermissionMode,
    pub recent_session: Option<SessionSummary>,
}
```

## 实施顺序

```
Gate B (Workspace)  ← 第一块
  ↓
Gate F (会话管理)
  ↓
Gate A (统一入口)
  ↓
Gate G (退出恢复)
  ↓
后续 Gate C/D/E/H/I
```

## 第一轮实现（T1-T4）

| 任务 | 内容 | 文件 |
|------|------|------|
| T1 | workspace/ 目录 + 类型定义 + detect 骨架 | ~3 files |
| T2 | run() 接入 detect_workspace，App 持有 context | ~2 files |
| T3 | git status 检测 + 超时降级 | 1 file |
| T4 | 最近会话恢复（不暴露 task_id） | ~2 files |

## 不做的事（首轮）

- 输入编辑改进（Gate C）
- 结构化输出投影（Gate D）
- 输出噪音控制（Gate E）
- /review /qa Combo 集成（留"能力未就绪"）
- soma-workspace 独立 crate
- 桌面端 / 插件 / 多 Agent

## 已有可复用的代码

- `soma-runtime/src/task_manager.rs` — SQLite task 持久化
- `soma-protocol/src/params.rs` — TaskSummary
- `soma-tui/src/session.rs` — Session 序列化

## 审查结论

- Architecture Review: 3 issues found, all folded
- Code Quality: 2 advisories
- Outside Voice: skipped by choice
- Scope: accepted as-is (B→F→A→G order)
