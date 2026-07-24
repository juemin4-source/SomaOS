# SomaOS Handoff — 2026-07-24T23:30

## 当前状态

v0.1.0 已发布。0.2 Phase 1 已启动——协议 crate 骨架就位。

## 里程碑完成情况

| 阶段 | 状态 |
|------|------|
| v0.1.0 Release | ✅ tag + canary 6/6 + release binary |
| 0.1 RC Store 接入 | ✅ commit `d094cae` |
| 0.2 设计文档 | ✅ 已锁定、已 eng review |
| soma-protocol crate | ✅ 已创建、已推送 |
| soma-client crate | ✅ 已创建、已推送 |

## 0.2 Phase 1 剩余任务

按优先级：

1. **soma-runtime crate** — 可独立启动的进程，接收 JSON-RPC over stdio，路由到 Core
2. **CLI 切客户端** — soma-cli 改为通过 soma-client 发协议，不再直接调 Core
3. **stdin/stdout transport** — 真正的进程间通信，替换 stub
4. **Run 实体** — 最小 Run struct + 状态（ACCEPTED/RUNNING/YIELDED/COMPLETED/FAILED/CANCELLED）

## 关键架构裁决（不要重新讨论）

- CLI 编译期隔离：soma-cli → soma-client → soma-protocol，不得依赖 soma-core
- Protocol 是独立 crate，不放 soma-model（控制面 ≠ 模型面）
- Client 是独立 crate，不放 soma-core（协议客户端 ≠ 领域内核）
- Run 是 Phase 1 必须有但最小化的实体（不是完整调度系统）
- Daemon 不是 0.2 起点（先按需拉起子进程）

## 设计文档位置

`.gstack/somaos-02-design-20260724.md` — 包含完整的架构裁决和 GSTACK REVIEW REPORT

## 最新 commit

`8cad17f` — feat: soma-protocol + soma-client crate scaffolding
