# Phase 2：三个 gstack Skill 的深度解剖

> **原则：** 整体优先，抽取谨慎。不拿本体裁剪活物。
> **方法：** 源码分析 + 真实运行观察

---

## 一、/investigate — 调查复合能力

### 1.1 用户委托的工作

用户把一个"发生了什么"的问题交给它。委托范围：从症状到根因再到修复的全链路。

```
用户: "这个测试挂了，帮我查一下"
→ /investigate 负责: 理解症状 → 读取代码 → 追溯变更 → 形成假设 → 验证 → 修复 → 产出报告
```

### 1.2 加载的方法、判断原则和知识

| 组件 | 类型 | 说明 |
|------|------|------|
| **铁律** | 硬规则 | "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST" |
| **阶段系统** | 方法 | Phase 1 (Root Cause) → Phase 2 (Pattern) → Phase 3 (Verify) → Phase 4 (Fix) → Phase 5 (Report) |
| **3-Strike 规则** | 边界 | 3 个假设失败后必须 STOP，提供三种选项 |
| **Scope Lock** | 机制 | 定位根因后锁定修改范围，防止 scope creep |
| **模式库** | 知识 | 6 种预定义 Bug 模式（Race/Nil/State/Integration/Config/Stale）|
| **学习系统** | 记忆 | `gstack-learnings-search` 检索 + `gstack-learnings-log` 记录 |
| **外部搜索** | 工具 | WebSearch（需脱敏） |
| **Red flags** | 判断 | "Quick fix for now", "Proposing fix before tracing data flow", "Each fix reveals a new problem" |

### 1.3 自带的脚本/私有执行器

- `gstack-learnings-search` — 学习检索
- `gstack-learnings-log` — 学习记录
- `gstack-config` — 配置读取
- `gstack-slug`, `gstack-session-kind` — 上下文检测
- `gstack-freeze/bin/check-freeze.sh` — 范围锁定（条件可用）
- `gstack-brain-cache` — 跨会话记忆（条件可用）

没有私有执行器。依赖 gstack bin/ 共享工具。

### 1.4 需要的 Organs 和底层工具

| 工具 | 用途 |
|------|------|
| Git | git log, git diff（追溯变更）|
| File/Read | 读取代码、配置、日志 |
| Grep | 搜索引用和模式 |
| Read | 读取文件内容 |
| WebSearch | 搜索已知 Bug 模式（条件可用）|
| Process | 运行测试、复现 Bug |

### 1.5 边界和协调顺序

```
严格顺序:
  Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

回退:
  Phase 3 假设失败 → 回到 Phase 1

阻塞条件:
  3 个假设全部失败 → STOP + AskUser（3 选项）

完成条件:
  根因确认 + 修复实施 + 测试通过 + 结构化报告输出

跳转条件:
  发现架构性问题 → 可能跳转到 /review 或 /spec
```

### 1.6 正式产物

```
DEBUG REPORT:
  Symptom, Root cause, Fix (file:line), Evidence (test output),
  Regression test (file:line), Related (TODOS, prior bugs), Status
```

### 1.7 何时完成/失败/阻塞

| 状态 | 条件 |
|------|------|
| DONE | 根因确认 + 修复 + 测试通过 + 报告输出 |
| DONE_WITH_CONCERNS | 修复完成但存在已知局限 |
| BLOCKED | 3 个假设失败且用户选择暂缓 |
| 转向 | 发现架构性问题 → `review` 或 `spec` |

---

## 二、/review — 审阅复合能力

### 2.1 用户委托的工作

用户把"判断这次改动是否可以发布"交给它。委托范围：从 diff 到 Findings 到 Gate 结果。

### 2.2 加载的方法、判断原则和知识

| 组件 | 类型 | 说明 |
|------|------|------|
| **Scope Drift 检测** | 方法 | 先检查意图 vs 交付是否一致，再审阅代码质量 |
| **Plan 交叉验证** | 方法 | 检查计划 vs 实现的偏差 |
| **专业分发** | 机制 | Specialists（Testing/Maintainability/Security/Performance 等）按 scope 并行分发 |
| **Checklist** | 知识 | 分类的审阅标准（SQL、并发、LLM 信任边界等 10+ 类）|
| **Fix-First** | 原则 | 每个 Finding 必须有行动，不只看不动 |
| **Adversarial Review** | 方法 | Claude + Codex 双模型对抗审阅 |
| **Prior Learnings** | 记忆 | 过去的审阅模式检索 |
| **Documentation Check** | 检查 | 代码变化 → 文档是否需要更新 |

### 2.3 自带的脚本/私有执行器

- `gstack-diff-scope` — diff 范围分析
- `gstack-review-log` — 审阅结果持久化
- `gstack-specialist-stats` — 专家命中率统计
- `gstack-learnings-search` — 学习检索
- `gstack-codex-probe` — Codex 可用性检测
- `slop:diff`（通过 bun run） — 代码质量扫描

### 2.4 需要的 Organs 和底层工具

| 工具 | 用途 |
|------|------|
| Git | diff, log, merge-base |
| gh/glab | PR/MR 信息 |
| File/Read | 读取代码、checklist、plan |
| Grep | 搜索引用 |
| Agent | 分发 Specialist 子任务 |
| WebSearch | 框架最佳实践验证 |
| Bun | slop 扫描 |
| Codex | 对抗审阅（条件可用）|

### 2.5 边界和协调顺序

```
Step 0 (平台检测) → Step 1 (分支检查) → Step 1.5 (Scope Drift)
→ Step 2 (Read Checklist) → Step 3 (Get Diff)
→ Step 4 (Critical Pass + Specialists)
→ Step 5 (Fix-First: 分类 → 自动修复 → 批量 Ask → 应用)
→ Step 5.5-5.8 (TODOS + Doc + Adversarial + Persist)

回退:
  Scope Drift 发现意图不清 → 退回 /spec 或 /office-hours
  CRITICAL Finding 未解决 → 不得 ship

阻塞条件:
  Checklist 不可读 → STOP
  Plan 无法找到 → 跳过（不阻塞）

完成条件:
  Findings 全部处理（修复或显式跳过）
  + 审阅结果持久化
```

### 2.6 正式产物

```
Scope Check: CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING
Findings: [severity] (confidence N/10) file:line — summary
Quality Score: 0-10
Gate Result: PASS / FAIL / BLOCKED
Adversarial Review Synthesis
```

### 2.7 跨 Skill 共用的稳定操作

这些操作在 review、qa、ship 中重复出现：

- `change_scope.inspect` — diff 范围分析
- `plan.compare_to_delivery` — 计划 vs 实现对比
- `test.impact_analysis` — 测试影响范围判断
- `finding.classify` — 发现的分类和定级
- `quality.gate_evaluate` — 门禁结果判定

---

## 三、/ship — 交付复合能力

### 3.1 用户委托的工作

用户把"把当前改动安全地发布出去"交给它。委托范围：从 pre-flight 验证到版本号到推送的端到端发布。

### 3.2 加载的方法、判断原则和知识

| 组件 | 类型 | 说明 |
|------|------|------|
| **Verification Gate** | 硬规则 | "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" |
| **Rationalization Prevention** | 判断 | 4 种常见自我欺骗模式（should work / confident / tested earlier / trivial）|
| **Distribution Check** | 检查 | 新 Artifact 的分发渠道验证 |
| **Version Bump** | 机制 | 自动版本号管理 |
| **TODOS 交叉引用** | 检查 | 更新 TODOS.md 中已完成项 |
| **Bisectable Commits** | 方法 | 提交需支持 git bisect |
| **Pre-push 凭据检查** | 安全 | 阻止含凭据的推送 |

### 3.3 自带的脚本/私有执行器

- `gstack-version-bump` — 版本号管理（关键私有执行器）
- `gstack-config` — 配置读写
- `gstack-review-log` — 读取审阅结果
- `gstack-redact` / `gstack-redact install-prepush-hook` — 凭据保护
- `gstack-timeline-log` — 指标记录
- `gstack-learnings-log` — 学习记录

### 3.4 需要的底层工具

| 工具 | 用途 |
|------|------|
| Git | merge, commit, tag, push |
| gh/glab | PR/MR 创建和合并 |
| Cargo/npm/bun | 构建和测试 |
| Codex | 版本 bump 验证（条件） |

### 3.5 边界和协调顺序

```
Step 1 (Pre-flight) → Step 2 (Dist Check) → Step 3 (Merge Base)
→ [Steps 4-11: 构建和测试] → Step 12 (Version Bump)
→ Step 14 (TODOS) → Step 15 (Commit) → Step 16 (Verification Gate)
→ Step 17 (Push) → Step 20 (Metrics)

回退:
  Verification Gate 测试失败 → 回到 Step 5
  Pre-flight 检测到未解决的 Review → 阻止 Ship

阻塞条件:
  在 base branch → abort
  审阅未通过 → 阻止

完成条件:
  测试通过 + 版本 bumped + commits pushed + metrics persisted
```

### 3.6 正式产物

```
- 版本号（VERSION 文件更新）
- Git tag
- CHANGELOG 条目
- Push 到 remote
- 指标记录（用于 /retro）
```

---

## 四、三者共用能力表

### 4.1 整体保留的部分（不拆）

以下方法/原则应整体保留为厚 Skill：

```
/investigate 的:
  - 5 阶段调查方法（Phase 1-5）
  - 3-Strike 规则
  - Scope Lock 机制
  - Iron Law（无根因不修复）
  - DEBUG REPORT 格式

/review 的:
  - Scope Drift 检测方法
  - Fix-First 原则
  - Specialist 分发机制
  - Adversarial Review 流程
  - Checklist 分类体系
  - 审阅结果持久化

/ship 的:
  - Verification Gate + Rationalization Prevention
  - Distribution Check
  - Bisectable Commits 约束
  - 版本号管理策略
```

### 4.2 Softill 候选（值得独立抽取）

| Softill | 来源 Skill | 理由 |
|---------|-----------|------|
| `change_scope.inspect` | review/qa/ship | 多次出现，输入 diff → 输出结构化改动范围 |
| `test.impact_analysis` | review/qa | 确定哪些测试受变更影响 |
| `finding.classify` | review | 跨 review 和 qa 的分类和严重程度定级 |
| `quality.gate_evaluate` | review/ship | 判断门禁是否通过（PASS/FAIL/BLOCKED）|
| `release.readiness_check` | ship | 发布前的整体就绪检查 |
| `evidence.verify_fresh` | ship | 验证证据是否在最新代码上产生 |

### 4.3 运行时 Combo 变化

观察到的 Combo 变化模式：

```
// investigate: 标准路径
investigate.orient → investigate.hypothesis → investigate.test
    → investigate.fix → investigate.verify → investigate.report

// investigate: 发现架构问题时的路径变化
investigate.orient → investigate.hypothesis → investigate.test
    → [3 hypotheses fail] → STOP → /spec 或 /review

// review: 标准路径
review.scope_check → review.critical_pass → review.fix_first
    → [AUTO_FIX] → review.adversarial → review.persist

// review: 发现范围不清时的路径变化
review.scope_check → [DRIFT DETECTED] → /spec 或 /office-hours

// ship: 标准路径
ship.preflight → ship.merge → ship.build → ship.test
    → ship.version → ship.commit → ship.verify → ship.push

// ship: 测试失败时的路径变化
ship.preflight → ship.merge → ship.build → ship.test
    → [TESTS FAIL] → 退回 fix/review
```

---

## 五、第一个 SomaOS 原生化切片建议

### 建议：Review Combo 完整原生化

**修订理由（V2 本体更新后）：**
此前建议的 "Review Finding 处理" 和 "Soma 拿回路由、状态、门禁和证据" 仍然是把一个活生生的 Combo 切成治理薄片。
现在更合理的是：第一批原生化对象直接是完整的 Review Combo。

**第一版能力范围：**
SomaOS 能够：
1. **发现** review Combo — 知道它存在、解决什么问题
2. **加载**它需要的 Skill（审阅方法、Scope Drift、Fix-First）
3. **暴露并调用**它的 Softill（diff-scope、review-log、codex-probe）
4. **接通** Git、File、Process Organ
5. **执行**完整 Review 流程（从获取 diff 到产出 Findings）
6. **接收** Findings 和 Gate Result
7. **根据结果**继续修复或进入 Ship

**技术方式：Hosted Native**
第一版保留 gstack 文件与 bin 的执行，SomaOS 掌握编排控制。
只有当某一 Softill 满足"不依赖 Claude Code 宿主也可执行"时，才考虑真正的 Native 实现。

**这验证的是：**
Skill + Softill + Organ → Combo → 解决真实研发工作

而不是再次验证治理链。
