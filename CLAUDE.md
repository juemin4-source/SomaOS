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
soma-cli
   │
   ▼
soma-core         ← Ports: ModelProvider, CapabilityRuntime, CaseStore
   │
   ├── soma-model       ← 自有 ModelRequest/ModelEvent/ToolCall 类型
   ├── soma-model-rig   ← Rig 适配器（边界 crate）
   ├── soma-capability  ← CapabilityContract + Organ trait + 实现
   └── soma-store       ← CaseStore trait + SQLite 实现
```

## 核心 crate

| crate | 职责 |
|-------|------|
| `soma-cli` | CLI 入口，composition root |
| `soma-core` | TurnEngine 状态机、EventEnvelope、Ports trait 定义 |
| `soma-model` | Soma 自有模型交互类型 |
| `soma-model-rig` | Rig Provider 适配器 |
| `soma-capability` | 能力契约、Organ 实现（File/Process/Git） |
| `soma-store` | 持久化接口与 SQLite 实现 |

## 里程碑

- **M0**: TurnEngine 闭环 + EventEnvelope + CLI 最小可见原型 ✅
- **M1**: CaseStore 持久化 + File/Process/Git Organ 🔄
- **M2**: Permission 系统 + Action Trace
- **M3**: Evidence + 验证失效
- **M4**: 进程恢复 + 完整性验收
- **M5**: Fixture QA + 证据绑定

## 命令

```powershell
cargo build                    # 编译
cargo test                     # 运行全部测试（当前 22 个）
$env:ANTHROPIC_API_KEY="sk-ant-..."
cargo run -- investigate "问题描述"
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
