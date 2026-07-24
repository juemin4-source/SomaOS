# Design: SomaOS 0.2 — 持久本地工作运行时

**Date:** 2026-07-24
**Branch:** main
**Status:** PREMISES AGREED
**Mode:** Builder → Product

---

## Problem

0.1 交付了一个进程内 CLI，核心能力（Case、Turn、Action、Evidence、Policy）已实现，但 Store 未接入生产路径：
- `investigate` 事件只在内存
- `resume` 无真实事件可恢复
- Crash Recovery 不可验证

0.2 的目标是从"一个人的 CLI"升级为"可由人、应用和其他 AI 共同控制的持久本地运行时"。

## 前提（Premises）

经挑战后确认：

1. **Daemon 不是 0.2 起点。** 先做可按需拉起、状态外置的 Runtime 进程。Core 从第一天保持进程无关（不拥有 stdin，CLI 是 Adapter）。
2. **Native Protocol 是权威语义，MCP 是 Adapter。** 先定义 `SomaCommand` / `SomaEvent` / `SomaRequest` / `SomaResponse`，第一种传输用 JSON-RPC over stdio。MCP Adapter 投影片面给 Claude Code 等 MCP Host。
3. **Run 是多 Turn 执行尝试，非单次 request_model。** 正式层级：`Case → Run → Turn → Action`。Run 在 COMPLETED / BLOCKED / NEEDS_DECISION / YIELDED 等持久边界结束。
4. **Store 必须先接入生产路径。** 这不是 0.2 前提，而是 0.1 的真实缺口。先修再进 0.2。

---

## 路线修正

### Phase 0: 0.1 RC 收口（立即）

| 任务 | 说明 |
|------|------|
| investigate 接入 CaseStore | `TurnEngine::with_store()` 在 investigate 路径启用 |
| resume 验证 | 从真实 Store 重建 Case + 重跑 E2E |
| crash-harness 测试 | 杀死子进程验证恢复 |
| 全量 Review / QA / Ship | 确认 0.1 的"可恢复"承诺真实成立 |

### Phase 1: 最小外部控制闭环（已锁定）

**范围裁决：** 接受裁剪，但保留最小 Run 实体。

#### 1. Soma Native Protocol

传输无关的类型定义：`SomaCommand` / `SomaResponse` / `SomaNotification` / `ProtocolError`

第一批方法仅做：
- `case/create`
- `case/get`
- `run/start`
- `run/get`
- `run/cancel`

#### 2. 最小 Run 实体

```
Run
├─ run_id
├─ case_id
├─ submitted_by
├─ status (ACCEPTED | RUNNING | YIELDED | COMPLETED | FAILED | CANCELLED)
├─ started_at
├─ finished_at
└─ outcome
```

暂不做：完整 Run 调度策略、Turn/Action 对外暴露、Budget、多 Run 并行、Principal。

#### 3. JSON-RPC over stdio

```
soma-runtime --stdio
```
- `run/start` 立即返回 `run_id`，不阻塞
- 进度与终态通过 Notification 发出：`run.started` / `run.output` / `run.yielded` / `run.completed` / `run.failed`
- 每条 Notification 携带 `case_id` + `run_id` + `sequence`（为未来 Event Replay 预留）

#### 4. Runtime 最小骨架

CLI/外部调用方按需启动子进程，不常驻：
```
Client → spawn soma-runtime --stdio → JSON-RPC → Core
```
Case 和 Run 状态必须进入 Store。

#### 5. CLI 改为真实客户端

CLI 不得保留直接调用 Core 的生产旁路。Native Protocol 是内外统一的真实产品边界。

#### Phase 1 验收标准

1. 外部测试程序可以启动 `soma-runtime --stdio`
2. 通过 JSON-RPC 创建持久 Case
3. `run/start` 立即返回稳定 `run_id`
4. Runtime 通过 Notification 输出运行进度和终态
5. `run/get` 可查询当前状态和结果
6. `run/cancel` 能取消运行中的 Run
7. CLI 使用同一协议完成现有 `investigate` 路径
8. Runtime 退出后 Case 与已结束 Run 仍可查询
9. CLI 中不存在直接调用 Core 的生产旁路
10. Fixture Provider 的完整协议 E2E 自动通过

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 3 architecture findings resolved, scope reduced per recommendation |

**Architecture findings resolved:**
1. CLI bypass prevention → A) Compile-time isolation + `soma-client` crate. CLI depends only on soma-client + soma-protocol.
2. New crate policy → A) Independent `soma-protocol` and `soma-client` from day 1. Protocol belongs in control plane, not model crate.
3. Dependency rules frozen → `soma-cli` must not depend on soma-core/soma-model/soma-store/soma-capability. CI dependency-boundary check required.

**CODEX:** Skipped (codex_reviews not configured)
**VERDICT:** ENG CLEARED — scope accepted with reduction (minimal Run + protocol skeleton, defer full Run/Turn/Action scheduling)

**NOT in scope (Phase 1):**
- MCP Adapter — Phase 2
- Turn/Action public protocol — Phase 2+
- Principal/Delegation — Phase 2
- Event replay / reconnection — Phase 2
- Multi-client concurrent access — Phase 2+
- On-demand daemon lifecycle — Phase 2+
- HTTP/WebSocket transport — Phase 2+

**What already exists:**
- `soma-core` has TurnEngine, EventEnvelope, Policy — Runtime wraps, doesn't rebuild
- `soma-store` has SQLite CaseStore with append/replay — extend for Run persistence, don't replace
- `soma-model` has ToolDefinition, ToolCall types — protocol reuses serde patterns
- JSON-RPC is a standard, not an invention — Rust has `serde_json` already in the dep tree

**Failure modes:**
- Runtime process crash mid-Run → Run enters FAILED, Case remains queryable (store-persisted)
- Protocol version mismatch between CLI and Runtime → Runtime rejects unknown methods, CLI gets ProtocolError
- `run/start` finishes before Runtime outputs any Notification → Client can poll `run/get` for terminal state
- Store write fails during `case/create` → Runtime returns error, CLI retries or reports to user

**Parallelization:**
- Sequential: crate creation (protocol → client → runtime), all interdependent
- One implementation lane: Phase 1 is inherently sequential since each layer builds on the prior

NO UNRESOLVED DECISIONS

### Phase 2: 外部 AI 接入（MCP + 治理）

6. **MCP Adapter** — Native Protocol → MCP Tools/Resources
7. **Principal / Delegation** — Human Owner / External Agent / Application / System
8. **可重连事件流** — `last_event_sequence` + 断线续读

### Phase 3: 后段（按需）

- On-demand local runtime（多客户端、断线后继续执行）
- 多客户端并发订阅
- ACP Adapter

---

## 0.2 不做（明确非目标）

- Desktop UI（Tauri）
- 浏览器 / Blender / ComfyUI Organ
- 多 Agent 公司
- 通用 Skill 市场
- 高级动态 Combo
- 远程云执行
- 周道完整编译链
- SomaOS 自举开发

## 产品承诺

> 外部 AI 或应用能够创建、查询、暂停、继续和接管 Soma Case；连接中断后工作仍然存在，所有调用仍经过 SomaOS 的权限、状态和证据治理。

## 0.1 RC 状态

> 已由 commit `d094cae` 完成。Store 已接入 investigate 路径。36/36 测试通过。缺口关闭。
