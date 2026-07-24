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

### Phase 1: 0.2 核心（协议 + Runtime 骨架）

1. **Soma Native Protocol** — typed command/event/request/response 类型
2. **JSON-RPC over stdio** — 第一种传输
3. **soma-runtime crate** — 可独立启动的 Runtime 进程
4. **CLI → Runtime** — `soma` 命令变为客户端，通过 stdio JSON-RPC 控制 Runtime
5. **Case ↔ Run 正式拆分** — Run 实体 + Run 状态机

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

## The Assignment

> **在你离开之前：** 改一行代码。把 `soma-cli/src/main.rs` 里 `TurnEngine::new()` 那行改成 `TurnEngine::with_store()` 并传入 SQLite Store。然后 `cargo test`。如果测试全过——恭喜，0.1 的缺口已经修了一半。如果挂了——那就是我们需要正视的证据：0.1 的"可恢复"承诺尚未成立。
