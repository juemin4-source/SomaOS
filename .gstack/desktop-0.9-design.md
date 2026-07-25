# SomaOS Desktop — 0.9-A 设计文档

> 日期：2026-07-25
> 状态：设计冻结
> 上一阶段：0.85 — Softill 开放与生长（三 Gate 完成）
> 下一阶段：0.9-B — 完整产品化

---

## 一、产品定位

Codex 式桌面任务工作区。聊天是主交互方式，但底层数据模型从第一天就是结构化的：

```
Project → Task → Turn → WorkState → Artifact
```

界面可以暂时不展示全部，但不能把数据退化成聊天记录。

## 二、架构

```
React Frontend (Tauri webview)
    │
    │ Tauri IPC (invoke / events)
    ▼
Rust Backend (src-tauri)
    │
    │ soma-client / JSON-RPC
    ▼
soma-runtime (child process)
```

### 分层边界

| 层 | 职责 | 知道什么 |
|----|------|---------|
| React 前端 | 渲染、交互、本地状态 | 只消费 `SomaUiEvent`，只调用 `invoke()` |
| Tauri 后端 | Runtime 生命周期、事件归一化 | 管理 runtime 进程、JSON-RPC、重连 |
| soma-runtime | AI 执行引擎 | Combo 编排、Softill 调用、TurnEngine |

**React 不知道：** runtime 子进程启动方式、JSON-RPC request ID、stdout/stderr 帧协议、重连机制、进程退出信号、取消请求的 wire format。

## 三、双层事件模型

### 架构

```
TurnEngine / Combo / Softill
        ↓
     EventSink                    ← 传输无关事件层
        ↓
SomaRuntimeEvent                  ← 运行时事实（稳定、与 UI 无关）
        ↓
JSON-RPC Notification Adapter     ← stdio 序列化
        ↓
soma-client.read_notification()
        ↓
Tauri Event Bridge                ← 投影为 UI 事件
        ↓
SomaUiEvent                       ← 桌面端投影（可合并、折叠、改标题）
        ↓
React Store
```

### SomaRuntimeEvent（协议层 — runtime 发送）

```typescript
// Event Envelope — 所有运行时事件的统一包装
interface RuntimeEventEnvelope {
  schema_version: 1;
  task_id: string;
  turn_id: string;
  sequence: number;           // 单 Turn 内单调递增
  kind: RuntimeEventKind;
  payload: Record<string, unknown>;
}

type RuntimeEventKind =
  | "assistant_delta"
  | "tool_started"
  | "tool_updated"
  | "tool_completed"
  | "artifact_created"
  | "work_state_changed"
  | "approval_requested"
  | "decision_requested"
  | "turn_interrupted"
  | "turn_completed"
  | "turn_failed";
```

### SomaUiEvent（桌面层 — Tauri 投影后推送给 React）

```typescript
type SomaUiEvent =
  | { type: "assistant_delta"; taskId: string; text: string }
  | { type: "tool_started"; taskId: string; toolCallId: string; title: string }
  | { type: "tool_updated"; taskId: string; toolCallId: string; output: string; truncated: boolean }
  | { type: "tool_completed"; taskId: string; toolCallId: string; success: boolean }
  | { type: "artifact_created"; taskId: string; artifactId: string; kind: string }
  | { type: "work_state_changed"; taskId: string; combo: string; stage: string }
  | { type: "approval_requested"; taskId: string; requestId: string; summary: string }
  | { type: "turn_interrupted"; taskId: string }
  | { type: "turn_completed"; taskId: string }
  | { type: "error"; taskId: string; message: string }
```

### 请求模型（非阻塞）

```
→ task/send_message
   { task_id, text }
← 立即返回 accepted
   { task_id, turn_id }

随后通过 notification 持续推送：
   → task/event { schema_version, task_id, turn_id, sequence, kind, payload }
```

### 持久化边界

| 数据类型 | 持久化 | 说明 |
|---------|--------|------|
| assistant_delta | ❌ 临时 | 只在当前连接中存在 |
| tool_updated | ❌ 临时 | 累计输出有上限 |
| 用户消息 | ✅ | 写入任务持久层 |
| 完成后的 Assistant 消息 | ✅ | 写入任务持久层 |
| tool_completed 摘要 | ✅ | 写入任务持久层 |
| Artifact | ✅ | 写入 ArtifactStore |
| WorkState | ✅ | 写入磁盘 |
| Turn 终态 | ✅ | 写入任务持久层 |

恢复时：`task/get` 返回已提交快照，再继续订阅当前 Turn。

### `tool_updated` 安全约束

- 单次分块 ≤ 4KB
- 累计输出上限 256KB
- 超过上限后发送截断标记 `{ truncated: true }`
- 原始完整日志路径在 `tool_completed` 中附加

### React → Tauri 后端（命令调用）

```typescript
// 命令（通过 Tauri invoke）
create_task(projectRoot: string): Promise<string>
send_message(taskId: string, text: string): Promise<{taskId: string, turnId: string}>
cancel_turn(taskId: string): Promise<void>
respond_approval(taskId: string, requestId: string, approved: boolean): Promise<void>
respond_decision(taskId: string, requestId: string, decision: string): Promise<void>
list_tasks(): Promise<TaskSummary[]>
get_task(taskId: string): Promise<TaskDetail>

interface TaskSummary {
  id: string;
  title: string;
  status: "idle" | "running" | "completed" | "interrupted";
  createdAt: string;
  updatedAt: string;
}

interface TaskDetail extends TaskSummary {
  turns: Turn[];
  workState: WorkState;
  artifacts: Artifact[];
}
```

## 四、任务模型

多个持久化任务，同一时刻只有一个 active turn。

```
Task A ── Turn 1 ── Turn 2 ── ...     ← 可切换
Task B ── Turn 1 ── ...               ← 可恢复
                                       ← 同一时间只有一个在执行
```

- 可以创建多个任务
- 可以在任务间切换和恢复
- 同一时刻只允许一个任务执行（active turn）
- 其他任务处于 idle / waiting / completed
- 第一版不做多任务并发

### Runtime 协议（0.9-A 最小集）

| 方法 | 说明 | 返回 |
|------|------|------|
| `task/create` | 创建新任务 | `{ task_id }` |
| `task/list` | 列出所有任务 | `[TaskSummary]` |
| `task/get` | 获取任务详情（含快照） | `TaskDetail` |
| `task/send_message` | 发送消息（非阻塞） | `{ task_id, turn_id, accepted }` |
| `task/cancel` | 取消当前 Turn | 异步 → `turn_interrupted` |
| `task/respond_approval` | 响应审批请求 | `{ ok }` |
| `task/respond_decision` | 响应决策请求 | `{ ok }` |

`task/resume` 不独立存在——`task/get` 加载持久化状态后，`task/send_message` 即可继续。

## 五、0.9-A 纵向切片

### 必须成立

```
打开本地项目
→ 创建任务
→ 输入消息
→ runtime 流式返回
→ 用户看到 assistant_delta 实时渲染
→ 工具执行显示（tool_started / tool_updated / tool_completed）
→ WorkState 更新可视
→ 用户点击停止（cancel_turn）
→ 当前 WorkState 保存到磁盘
→ 关闭应用
→ 重新打开
→ 任务在侧栏可见
→ 恢复任务
→ 继续输入
→ runtime 从上一次工作状态继续
```

### 第一版不做

- ❌ 完整 Diff 编辑器
- ❌ 能力浏览器
- ❌ 插件安装页
- ❌ 复杂 Markdown 编辑
- ❌ 多标签页
- ❌ Worktree
- ❌ 多任务并发
- ❌ 完整 9 Combo 可视化

## 六、目录结构

```
soma-desktop/
├── src/                          (React 前端)
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.ts
│   │   └── styles.css
│   ├── features/
│   │   ├── tasks/
│   │   │   ├── TaskSidebar.tsx
│   │   │   └── taskStore.ts
│   │   ├── conversation/
│   │   │   ├── Conversation.tsx
│   │   │   ├── Composer.tsx
│   │   │   └── cells/           (消息渲染组件)
│   │   ├── execution/
│   │   │   ├── ToolCallCell.tsx
│   │   │   └── ApprovalCard.tsx
│   │   └── artifacts/
│   │       └── ArtifactCard.tsx
│   ├── runtime/
│   │   ├── commands.ts           (invoke 封装)
│   │   ├── events.ts             (事件监听 hook)
│   │   └── eventReducer.ts       (事件→状态归约)
│   └── types/
│       └── ui.ts                 (SomaUiEvent + 接口类型)
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               (Tauri 入口)
│   │   ├── runtime_manager.rs    (runtime 进程生命周期)
│   │   ├── commands.rs           (invoke handler)
│   │   ├── event_bridge.rs       (JSON-RPC → SomaUiEvent)
│   │   └── state.rs              (任务状态管理)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

不需要一次全部写满，但边界从第一天就定好。

## 七、技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Tauri v2 | 架构已定 |
| 前端 | React + TypeScript + Vite | Tauri 标准搭配 |
| 后端 Runtime 通信 | soma-client crate | 已有，复用 |
| 事件协议 | SomaUiEvent union type | 前端不依赖 runtime 内部协议 |
| 任务持久化 | WorkState (已有) + 磁盘 | 0.8 基础设施 |
| 不绕 Web | 直接 Tauri | 架构已定，不需要中间步骤 |

## 八、验收标准（0.9-A）

1. `create_task` → 侧栏出现新任务
2. `send_message` → runtime 启动 → 流式 delta 渲染
3. 工具调用：tool_started → tool_updated → tool_completed 三阶段可见
4. `cancel_turn` → 立即停止 → 状态保存
5. 关闭重开 → 任务在侧栏 → 恢复后继续
6. 切换任务 → 另一任务状态保持 → 恢复后继续
7. 不依赖外部 Web 服务（全部本地执行）

## 九、工作量评估

- 半天：EventSink + RuntimeEvent 协议 Spike（验证 notification 通路）
- 1-2 天 CC：可靠的最小纵向链（EventSink → notification → Tauri 桥 → 前端 reducer → 工具卡片 → 取消 → 持久化）
- 之后：长输出截断、恢复、审批等收口
- 1-2 天 human：样式打磨
- 不等于 0.9 完成，仅 0.9-A 垂直切片

---

*本文档由 `/office-hours` 生成。*
*关键设计决策由用户直接指定：桌面 UI 协议不透明化、多任务单 active turn、结构从第一天定义。*
