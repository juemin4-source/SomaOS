# SomaOS Handoff — 2026-07-25

> **会话终点:** 0.9-A 地基完成 — EventSink + TaskManager + task/* 协议
> **下一目标:** EventSink 通知适配 → Tauri 桥接 → React 前端 → 0.9-A 纵向切片

---

## 项目状态

```
0.2  执行内核                    ✅
0.3  Review Combo               ✅
0.5  Investigate → Fix → Review ✅
0.7  项目接管与连续性             ✅
0.8  完整研发主链（A-E）          ✅
0.85 Softill 开放与生长（A-C）    ✅
0.9  Desktop 地基                ⬜ 当前推进中
1.0  日常可用                    ⬜
```

## 本次完成

### 0.9-A 地基

| 组件 | 文件 | 状态 |
|------|------|------|
| **RuntimeEventEnvelope** | `soma-protocol/src/events.rs` | ✅ 12 事件类型 |
| **EventSink trait** | `soma-protocol/src/events.rs` | ✅ 传输无关 |
| **MemoryEventSink** | `soma-protocol/src/events.rs` | ✅ 测试用 |
| **TaskManager** | `soma-runtime/src/task_manager.rs` | ✅ 7 测试 |
| **task/* 协议 handlers** | `soma-runtime/src/main.rs` | ✅ 5 端点 |
| **task 协议参数** | `soma-protocol/src/params.rs` | ✅ |
| **设计文档** | `.gstack/desktop-0.9-design.md` | ✅ 双层事件模型 |
| **设计规范** | `.gstack/desktop-0.9-spec.md` | ✅ 13 屏幕 + 组件 |

### 设计稿（Figma "Spatial Workbench"）
- 13 屏全部从 Figma API 拉取分析
- 布局：Sidebar 272px / Workspace 1148px / Drawer 418px
- 组件库：Buttons、Pills、Execution Cards、Composer、Tool Call 三阶段
- 设计系统：Ambient Mint #3E8067、Ambient Blue #345F91

### E2E 验证
```
task/create           → ✅ {"task_id":"task-1"}
task/list             → ✅ [{"status":"idle"}]
task/send_message     → ✅ {"accepted":true,"turn_id":"..."}
```

### 测试
```
soma-protocol: 14 tests ✅
soma-core:     129 tests ✅
soma-runtime:  7 tests ✅
```

## 缺口清单（需继续推进）

### 优先级 P0 — 流式事件通路

```
[ ] EventSink → JSON-RPC notification 适配器
    └─ EventSink impl 将 RuntimeEventEnvelope 写为 task/event notification
    └─ 位置: soma-runtime/src/event_adapter.rs

[ ] Tauri Event Bridge
    └─ RuntimeEventEnvelope → SomaUiEvent 投影
    └─ 位置: soma-desktop/src-tauri/src/event_bridge.rs

[ ] Tauri 壳 + React 前端
    └─ soma-desktop crate (workspace 注册)
    └─ 目录结构: src/features/{tasks,conversation,execution,artifacts}
    └─ runtime/commands.ts + events.ts + eventReducer.ts
```

### 优先级 P1 — 执行 + 持久化

```
[ ] TaskManager 连 TurnEngine
    └─ send_message → 从 TurnEngine 流式执行
    └─ EventSink 连入 TurnEngine 调用链
    └─ Sequence 编号管理

[ ] 长输出安全
    └─ 4KB 单分块 / 256KB 累计上限 / 100ms 节流
    └─ 截断标记 + 完整日志路径

[ ] task/cancel → TurnEngine 实际中断
    └─ 停止模型请求 + 子进程
    └─ 保存 WorkState
    └─ 发送 turn_interrupted
```

### 优先级 P2 — 恢复 + 审批

```
[ ] 任务恢复: task/get 返回快照 → 继续订阅实时事件
[ ] approval_requested / respond_approval
[ ] decision_requested / respond_decision
```

### 优先级 P3 — 更多屏幕

```
[ ] Changes 三栏 Diff
[ ] Capabilities 浏览器
[ ] Settings ×6
[ ] First Run 引导
[ ] Task Summary Drawer
```

## 架构关键决策

1. **双层事件模型** — RuntimeEvent ≠ SomaUiEvent。Tauri 后端投影。
2. **非阻塞请求** — `task/send_message` 立即返回 `{accepted, turn_id}`，结果通过 notification 流推送。
3. **单 active turn** — 多任务持久化，同一时间只执行一个。
4. **持久化边界** — `assistant_delta` 和 `tool_updated` 不持久化。完成消息、Tool 终态、Artifact、WorkState 持久化。
5. **长输出节流** — 4KB 分块 / 256KB 上限 / 100ms 窗口合并。
6. **无 WebSocket** — 当前约束下 JSON-RPC stdio notification 足够。
7. **目录结构** — `src/features/{tasks,conversation,execution,artifacts}`，`runtime/`，`types/`。

## 关键文件位置

```
soma-protocol/src/
├── events.rs           RuntimeEventEnvelope + EventSink trait + 12 事件类型
├── params.rs           task/* 协议参数类型

soma-runtime/src/
├── main.rs             runtime 入口 + task/* handlers
├── task_manager.rs     多任务生命周期管理

.gstack/
├── desktop-0.9-design.md  架构设计文档（含双层事件模型）
├── desktop-0.9-spec.md    设计规范（13 屏幕 + 组件）
```

## 下次启动

1. 读本 HANDOFF.md 恢复上下文
2. 从 **EventSink → notification 适配** 开始（P0 第一条）
   - 创建 `soma-runtime/src/event_adapter.rs`
   - EventSink impl → `write_notification("task/event", ...)`
3. 然后搭 `soma-desktop` Tauri 壳
4. 然后是 React 前端骨架 + 事件 bridge
5. 验收：纵向切片 — 创建任务 → 发送消息 → 流式事件 → 前端渲染 → 取消 → 持久化 → 恢复

## 本地配置（不提交）

以下敏感信息存于 `.somaos/env.json`（已 .gitignore）：

```json
{
  "figma_token": "figd_...",        // Figma Personal Access Token
  "figma_file_key": "2ISwgYFvBb7QDEDbp3VIk9",  // "Spatial Workbench" 设计稿
  "proxy_host": "127.0.0.1",
  "proxy_port": 7890                // VPN 端口
}
```

使用方式（本会话已验证）：
```bash
TOKEN=$(python -c "import json; print(json.load(open('.somaos/env.json'))['figma_token'])")
FILE_KEY=$(python -c "import json; print(json.load(open('.somaos/env.json'))['figma_file_key'])")
curl -x http://127.0.0.1:7890 -H "X-Figma-Token: $TOKEN" "https://api.figma.com/v1/files/$FILE_KEY"
```

渲染设计稿截图：
```bash
# 获取 frame 渲染图
curl -x http://127.0.0.1:7890 -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=3:2&scale=2&format=png"
# 下载图片
curl -x http://127.0.0.1:7890 "<image_url>" -o screenshot.png
```

## 技术债务

- 所有 `#[non_exhaustive]` 枚举（RouteCondition/RouteDecision/RuntimeEventKind）
- 设计稿中的完整色值待从 Figma Foundations 页提取
- Changes 三栏 Diff 的语法高亮 library 选择
