# SomaOS — 以能力为第一公民的工作运行时

## 项目定位

SomaOS 不是一个"更强的 Coding Agent"。它是**一套允许 AI 获得不同身体、组织不同工作并对现实结果负责的通用工作操作系统。**

0.1 的切入产品是 **Soma Case**——一个以"工作案件"而非聊天会话为中心的本地代码问题调查与修复系统。

## 技术选型

- **核心语言**: Rust
- **模型层**: Rig 作为首个可替换 Provider Adapter
- **Agent 循环**: 自写 Turn Engine
- **桌面端**: Tauri + React + TypeScript（0.2）
- **系统形态**: 本地 Rust 运行时，CLI 与 Desktop 均为客户端
- **边缘能力**: 允许 Python/Node/MCP Sidecar

## 架构

```
soma-cli              ← 协议客户端（无 Core 依赖）
   │
   ├── soma-runtime   ← 独立子进程（组合根，包装 Core）
   │
   ▼
soma-core             ← Ports: ModelProvider, CapabilityRuntime, CaseStore
   │
   ├── soma-model       ← 自有类型
   ├── soma-model-rig   ← Rig 适配器
   ├── soma-capability  ← Organ trait + 实现
   └── soma-store       ← CaseStore/RunStore + SQLite

soma-protocol          ← 共享协议契约（JSON-RPC 类型）
soma-client            ← 协议客户端（soma-runtime 的子进程传输层）
```

## 核心 crate

| crate | 职责 | 依赖规则 |
|-------|------|---------|
| `soma-cli` | CLI 入口，thin client | 只依赖 `soma-client` + `soma-protocol` ✅ |
| `soma-runtime` | 独立子进程，composition root | 依赖全部 core crate |
| `soma-core` | TurnEngine 状态机、EventEnvelope、Run 实体、Policy | |
| `soma-model` | Soma 自有模型交互类型 | |
| `soma-model-rig` | Rig Provider 适配器 | |
| `soma-capability` | 能力契约、Organ 实现（File/Process/Git） | |
| `soma-store` | 持久化接口（CaseStore + RunStore）与 SQLite | |
| `soma-protocol` | JSON-RPC 协议类型（Request/Response/Notification + params） | 纯 serde，零内部依赖 |
| `soma-client` | Runtime 子进程传输层 | 只依赖 `soma-protocol` + tokio |

## 里程碑

- **v0.1.0** — TurnEngine 闭环 + M1-M5 全部完成 ✅ tag `v0.1.0`
- **v0.2 Phase 1** — 最小外部控制闭环 ✅
  - Run 实体 + RunStore ✅
  - soma-runtime crate（JSON-RPC over stdio）✅
  - 真实 stdin/stdout transport ✅
  - CLI 切割（无 Core 依赖）✅

## 命令

```powershell
cargo build                    # 编译全部
cargo test                     # 运行全部测试（当前 48 个）
$env:DEEPSEEK_API_KEY="sk-..."  # 或 ANTHROPIC_API_KEY
cargo run -- investigate "问题描述"
cargo run -p soma-runtime -- --stdio  # 直接启动 runtime
```

## 不可违背的设计约束

1. Ports & Adapters：Core 定义 trait，不依赖具体 Adapter 实现
2. Event 协议：forward-only append + read-time upcast
3. 并发模型：Tokio Core + Blocking stdin thread + channel
4. CLI 默认需 ANTHROPIC_API_KEY，生产不含 mock provider
5. Tool Call 必须经 ActionRequest → Permission → Execution → Observation 链
6. 代码修改后相关验证 Evidence 自动失效
7. 未知事件版本必须 Fail Closed
8. 拒绝 exactly-once → 改为"可判定、可回读、可恢复的副作用执行"
