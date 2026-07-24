# SomaOS Handoff — 2026-07-24 (Phase 1 Complete)

## 当前状态

v0.2 Phase 1 全部完成。架构从"CLI 直接调 Core"升级为"CLI → Client → Runtime → Core"三层。

## 架构变更

```
之前: CLI（组合根）→ Core → Capability/Store
之后: CLI（thin）→ Client → Runtime（组合根）→ Core
                    ↑                ↑
               soma-client      soma-runtime (独立进程)
                    ↓                ↓
               soma-protocol ←  JSON-RPC over stdio
```

关键设计约束已实施：
- `soma-cli` 不再依赖 `soma-core`/`soma-model`/`soma-store`/`soma-capability`/`soma-model-rig`
- 编译时隔离通过 `cargo tree` 已验证 ✅

## 新增/变更 crate

| crate | 状态 | 说明 |
|-------|------|------|
| `soma-core/src/run.rs` | ✅ 新增 | Run 实体 + RunStatus 状态机 + 4 tests |
| `soma-store/src/run_store.rs` | ✅ 新增 | RunStore trait + SQLite 实现（runs 表） |
| `soma-runtime/` | ✅ 新增 | 独立进程，JSON-RPC over stdio，包装 Core |
| `soma-client/` | ⬆️ 重写 | 从 stub 升级为真实子进程传输层 |
| `soma-cli/` | ⬆️ 重写 | 从组合根瘦身为 thin client |
| `soma-protocol/` | ⬆️ 更新 | 新增 RunStatus 枚举、通用 Notification 类型 |

## 协议方法

| 方法 | 说明 | 同步/异步 |
|------|------|----------|
| `case/create` | 创建 Case，返回 case_id | 同步 |
| `case/get` | 查询 Case 信息 | 同步 |
| `run/start` | 启动 Run，立即返回 run_id | 异步（通知流） |
| `run/get` | 查询 Run 状态 | 同步 |
| `run/cancel` | 取消运行中的 Run | 同步 |

Runtime 通知：`run.started` / `run.output` / `run.completed` / `run.failed` / `run.cancelled`

## 测试状态

```
48 tests, 全部通过
├── soma-capability: 11
├── soma-core: 13 (含 4 个 Run 新测试)
├── soma-protocol: 7
├── soma-client: 1 (runtime 子进程集成测试)
├── soma-store integration: 2
├── soma-core integration: 8
├── soma-model: 5
├── soma-model-rig: 2
└── soma-cli: 0 (thin client)
```

## 剩余技术债务（来自 0.1 复盘）

| 债务 | 优先级 | 状态 |
|------|--------|------|
| crash-harness 自动化测试 | P1 | ❌ 未开始 |
| CLI subprocess smoke test | P1 | ❌ 未开始 |
| output_schema 真实填充 | P2 | ❌ 未开始 |
| `action.completed` 事件移除 | P3 | ❌ 未开始 |
| `usage.updated` / `turn.suspended/resumed` 补齐 | P3 | ❌ 未开始 |

## 下一方向 (0.2 Phase 2+)

- MCP Adapter — Native Protocol → MCP Tools/Resources
- Turn/Action public protocol
- Principal/Delegation
- Event replay / reconnection
- HTTP/WebSocket transport

## 使用方式

```powershell
# 编译
cargo build

# 启动 runtime（直接）
cargo run -p soma-runtime -- --stdio

# 通过 CLI 使用（自动启动 runtime 子进程）
cargo run -- investigate "项目中有个 Bug: ..."

# 需要模型 Provider
$env:DEEPSEEK_API_KEY = "sk-..."
cargo run -- investigate "分析一下这个错误"
```

## 关键文件位置

```
soma-runtime/src/main.rs        — Runtime 主进程（~440 行）
soma-client/src/client.rs       — 子进程传输层
soma-cli/src/main.rs            — thin CLI（~180 行）
soma-core/src/run.rs            — Run 实体
soma-store/src/run_store.rs     — RunStore trait
soma-store/src/sqlite.rs        — SQLite 实现（含 runs 表）
```
