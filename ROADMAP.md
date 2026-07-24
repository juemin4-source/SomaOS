# SomaOS Roadmap

## M0 — Turn Engine 闭环 ✅

**目标**: 从 CLI 到模型到 Tool Call 暂停恢复的最小闭环。

### 交付物
- [x] SomaTurnEngine 状态机（Idle → AwaitingModel → ActionRequested → AwaitingObservation → Completed/Failed）
- [x] EventEnvelope 双版本化（envelope_version + event_type/event_version）
- [x] EventCodecV1（Fail Closed on unknown types/versions）
- [x] ModelProvider trait（async complete_stream with mpsc::Sender）
- [x] RigClaudeProvider（Rig 流式 adapter）
- [x] SQLite CaseStore（events + metadata 表）
- [x] CLI（soma investigate，需 ANTHROPIC_API_KEY）
- [x] 可观测性底座（tracing + 三分流预留）
- [x] 15 测试全通过

### M0 审阅修复
- [x] #1 tokio::spawn 替代 Runtime::new()
- [x] #2 ContextView 含 tools + observations
- [x] #3 tokio::time::timeout(120s)
- [x] #4 Rig 流式 model.stream()
- [x] #5 TwoPhaseProvider 移出生产 CLI
- [x] #7 EventCodecV1 实现
- [ ] #6 CaseStore 接入 → M1

---

## M1 — Case 持久化 + 三个 Organ 🔄

**目标**: 事件持久化 + 基础能力。

### 交付物
- [x] CaseStore 接入 TurnEngine（with_store / record_and_push / resume）
- [x] FileOrgan（read + search，路径穿越防护）
- [x] ProcessOrgan（白名单 + 黑名单 + 30s 超时）
- [x] GitOrgan（status / diff / log）
- [x] 7 Organ 测试
- [ ] Capability 注册表（Organ → ToolDefinition 映射）
- [ ] CLI ↔ Organ 接线（模型请求 → Organ 执行 → Observation）
- [ ] 22+ 测试

---

## M2 — Permission 系统 + Action Trace

**目标**: 每次 Action 请求的权限校验与完整审计。

- ActionRequest → PolicyCheck → PermissionResolved 链路
- 写入前授权（file.patch 必须暂停等待 Owner）
- Shell 风险分类（安全/警告/拒绝）
- Action Trace：每次 Action 的完整事件记录
- 写入范围限制（不允许越出项目仓库）
- 测试

---

## M3 — Evidence + 验证失效

**目标**: 证据分类、新鲜度管理和完成裁决。

- Evidence 分类（OBSERVATION / DIAGNOSIS / CHANGE / VERIFICATION / EXTERNAL_CONFIRMATION）
- 新鲜度敏感：仅 CHANGE + VERIFICATION 需 STALE_ON_CODE_CHANGE
- 代码修改时 content_hash 对比、关联 Evidence 标记 STALE
- ClaimProposed → ClaimAdjudicated 裁决
- 测试

---

## M4 — 进程恢复 + 完整性验收

**目标**: 中断恢复、副作用去重、换模型继续同一 Case。

- `soma resume SOMA-0001` 恢复 Case
- Action 标记 execution_started / committed（不追求 exactly-once）
- 换模型继续（`soma resume --model gpt-5`）
- 完整用户路径跑通
- 测试 + 验收

---

## M5 — Fixture QA + 证据绑定

**目标**: 真实问题验收与稳定性基线。

- Fixture Repo 植入三类问题（逻辑 Bug / 配置 Bug / 运行时 Bug）
- 每类至少 2 例
- 5 次独立 E2E 运行
- 成功率 >= 60%
- Transcript / Action / Cost / Turns / Evidence 全部保存

---

## 0.1 验收门禁

**系统不变量（100%）：**
- [ ] 越权写入必须阻断
- [ ] 权限请求不得跳过
- [ ] Evidence 失效不得漏项
- [ ] Crash 后不得静默重复已 committed 副作用
- [ ] ClaimProposed 必须经 ClaimAdjudicated

**模型质量（>= 60%）：**
- [ ] 三类 Fixture Bug 修复成功率达标
- [ ] 自然语言创建 Case 并产出可证伪假设
- [ ] 结论引用具体 Evidence ID + 摘要

## 长远方向（0.2+）

- Tauri Desktop UI
- 常驻 Soma Local Runtime（Daemon）
- 多 Skill 支持
- Skill 组合与 Combo 系统
- MCP/ACP Organ
- 周道编译链与 Rust 类型衔接
- 浏览器 / Blender / ComfyUI Organ
