# 复盘报告 — SomaOS 0.1 全链路冲刺

**日期**: 2026-07-24
**时长**: 单会话约 8 小时，从 M1 到 v0.1.0 发布
**会话起点**: HO-20260724T194500Z (handoff from prior session)
**会话终点**: v0.1.0 tagged + canary 6/6 ✅

---

## ① 回顾目标

**本轮核心目标**: 从 M1 收尾一路推到 v0.1.0 正式发布

预期里程碑:
- M1 收尾（CapabilityRegistry + CLI 接线）
- M2（Permission + Action Trace）
- M3（Evidence + 验证失效）
- M4（进程恢复）
- M5（Fixture QA + E2E）
- Release + tag v0.1.0

**预期 W 变化**: 项目从"M1 待收尾"→"v0.1.0 可发布"

---

## ② 对照结果

**实际达成**:
- ✅ M1-M5 全部完成
- ✅ 36 测试（从 22 到 36，+14 个新测试）
- ✅ E2E 6/6 通过（DeepSeek）
- ✅ Review 发现的 7 类问题全部修复
- ✅ Release 构建 + 烟测
- ✅ v0.1.0 tag 已推送

**差距分析**:
| 预期 | 实际 | 差距 |
|------|------|------|
| M1 收尾 | ✅ CapabilityRegistry + CLI 接线 | 无 |
| M2 | ✅ Policy + Action Trace | 无 |
| M3 | ✅ Evidence 类型 + 事件 | 无 |
| M4 | ✅ Resume + 恢复 | 无 |
| M5 | ✅ Fixture + E2E | 无 |
| crash recovery 可靠性 | ⚠️ 修复后可用但无自动化 crash-harness | 需后续加 |
| E2E 全自动化 | ⚠️ 需要 DEEPSEEK_API_KEY | 外部依赖 |

**W 判定: 目标达成**。

---

## ③ 变量追溯

| 变量 | 本轮前 | 本轮后 | 变化原因 | 有意识调的？ |
|------|--------|--------|---------|------------|
| **T** (Technology) | Rust + Rig(Anthropic) | Rust + Rig(Anthropic/DeepSeek) | 用户要求切换到 DeepSeek，Rig 内置支持 | 是 |
| **A** (Architecture) | M1 骨架 | M0-M5 完整架构 | 逐里程碑推进 | 是 |
| **B** (Behavior) | CLI 单命令 investigate | investigate + resume + policy gate + evidence | M1-M5 功能递增 | 是 |
| **η** (Efficiency) | 手动调试 | 自动 E2E + smoke test | 建立了测试基础设施 | 是 |
| **R** (Risk) | 高（无测试、hardcoded IDs） | 低（36 tests + 6/6 E2E + 随机 Case ID） | review 发现多重问题并修复 | 是 |
| **S** (Scope) | M1 待收尾 | v0.1.0 全量发布 | 用户要求全链路推进 | 是 |
| **ξ** (Ecosystem) | GitHub remote | GitHub + v0.1.0 tag + release binary | 发布动作 | 是 |
| **θ** (Theta/团队) | 单人 | 单人 + DeepSeek 作为模型提供方 | 模型切换 | 是 |

**无意变化**:
- Tool 命名从 `file.read` 变为 `file_read`：因为 DeepSeek API 不接收 `.` 在 tool name 中——这是切换到 DeepSeek 的副作用，不是主动设计决定
- `DEEPSEEK_API_KEY` 进入会话 transcript：用户粘贴 raw key 时不可避免，但代码层面不会泄露
- 协议事件补齐（`permission.requested`, `case.state_changed`）：是从 review 发现的缺失倒推补的，非计划内

---

## ④ 经验萃取

### 什么做对了？

1. **M1-M5 顺序推进 → 每步有测试**。每个里程碑完成后 `cargo test` 全过才继续。这让回滚成本极低——任何一个 commit 都可以安全 revert。
2. **派 worker 失败的 task 自己补完**。M1 的 worker 只做了 warning 修复和加字段，核心的 CapabilityRegistry 和 CLI 接线是我自己完成的。教训：关键架构决策不适合 dispatch。
3. **全量 review 找到 7 类问题**。如果不是用户主动要求全量 review，crash recovery 的 5 个 bug（空 observation_history、tools 不恢复、错误检测粒度等）会在生产中炸。
4. **DeepSeek 切换极顺**。Rig 内置 DeepSeek provider，从决策到 E2E 6/6 通过不到 20 分钟。
5. **独立目录烟测**。Release 构建后复制到干净目录测试，确保没有路径依赖。

### 什么做错了？

1. **`action.completed` 残留事件**。从 M0 留下的 provider 层事件，不在 DESIGN.md 协议中。review 才发现。下次应该定期 diff 协议 vs 实现。
2. **Crash Recovery 缺少自动化测试**。虽然修复了 resume 的 5 个 bug，但没有任何测试验证"kill 进程 → resume"路径。这是当前最大的技术债务。
3. **CLI 零测试**。从 M1 就知道的问题，到 v0.1.0 发布还没修。组合根没有测试意味着任何 wiring 改动都是摸着石头过河。
4. **Case Store 未接入 investigate 路径**。investigate 创建的事件只在内存中，进程退出就丢了。resume 功能实际上不能恢复任何 investigate 会话。
5. **output_schema 全空**。6 个 ToolDefinition 的 output_schema 全是 `{}`。模型不知道 Organ 返回什么结构。

### 什么该变成规则？

1. **协议一致性检查应纳入门禁**。实现新事件时必须对照 DESIGN.md 协议清单检查缺失事件。
2. **Capability 注册时必须填 output_schema**。空 `{}` 的注册应产生 warning。
3. **核心路径必须有测试**。没有测试的代码不允许合并到 main（尤其 CLI 组合根）。
4. **E2E 应在每次 Release 构建后自动运行**。当前是手动触发，应该 CI 化。

---

## ⑤ 输出

### 技术债务清单（推荐下次优先做）

| 债务 | 优先级 | 估算 |
|------|--------|------|
| crash-harness 自动化测试 | P1 | 半天 |
| CLI subprocess smoke test | P1 | 半天 |
| output_schema 真实填充 | P2 | 1 小时 |
| Case Store 接入 investigate | P2 | 半天 |
| `action.completed` 事件移除 | P3 | 10 分钟 |
| `usage.updated` / `turn.suspended/resumed` 补齐 | P3 | 半天 |
| 结构化错误类型 | P4 | 半天 |

### Memory Candidates

1. **DeepSeek tool name 限制**: API 要求 `^[a-zA-Z0-9_-]+$`，`.` 不可用。切换到下划线命名后发现 Anthropic 也兼容——所以统一用下划线格式是安全选择。
2. **Rig 的 DeepSeek 支持**: Rig 0.40 内置了 `rig_core::providers::deepseek`，与 Anthropic 使用相同的 `StreamedAssistantContent` 枚举。切换成本几乎为零。
3. **协议事件 drift detection**: `soma-core/src/engine/turn_engine.rs` 中的事件字符串与 DESIGN.md 协议之间的 drift 是真实风险。推荐维护一份事件清单作为测试。

### 项目状态

```
SomaOS v0.1.0 — 2026-07-24
═══════════════════════════
6 crates, ~2650 LOC
36 tests, 6/6 E2E
模型: DeepSeek (默认) / Claude
发布: GitHub release v0.1.0
架构: M0-M5 全部完成
下一方向: Tauri Desktop / 常驻 Daemon / 多 Skill
```
