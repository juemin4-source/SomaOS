# gstack 能力地图 — Phase 1：源码地图

> **来源:** `G:\Downloads\gstack-main\gstack-main/`
> **状态:** Phase 1 完成，供 Phase 2 责任分解使用

---

## 一、gstack 全景

gstack 是一个**研发工作方式框架**，不是工具库。它由约 20 个 Skill（顶层命令）、40+ 个 bin 工具、共享 lib 和严格的 Skill 间路由组成。

### 核心概念

```
Skill ——— 对一段完整专业工作负责的命令（/review, /qa, /ship）
  ├── 入口条件（什么时候可以进入）
  ├── 工作步骤（固定的专业流程）
  ├── 产物（Findings、报告、Checkpoint）
  ├── 完成条件（什么算通过）
  └── 路由关系（什么技能在什么阶段可以调用）
```

---

## 二、Skill 全景表

| Skill | 目录大小 | 核心职责 | 主要步骤/阶段 |
|-------|---------|---------|-------------|
| **/spec** | 156K | 将模糊需求转化为可执行的规格说明 | 理解 Why → Scope/Boundaries → 技术侦查 → Draft Review → Quality Gate → 归档 |
| **/autoplan** | 148K | 自动生成实施计划，管理决策分类 | 6 决策原则 → 分类 → 串行执行 → Intake + Restore |
| **/plan-eng-review** | 157K | 工程方案审阅 | 标准审阅流程 |
| **/plan-ceo-review** | 224K | 产品/战略方案审阅 | CEO 视角的审阅流程 |
| **/review** | 192K | 代码变更审阅 | Scope Drift → Read Checklist → Get Diff → Specialist Dispatch → Fix-First → Adversarial → Persist |
| **/qa** | 108K | 质量保证与测试体系建设 | Setup → Framework Bootstrap → Best Practices → CI/CD → 产出 TESTING.md |
| **/qa-only** | 72K | 只运行测试不建体系 | 轻量级 QA |
| **/ship** | 277K | 从分支到发布的完整交付 | Pre-flight → Dist Check → Merge → Version Bump → TODOS → Commit → Verification → Push → Metrics |
| **/land-and-deploy** | 148K | 部署到生产环境 | 部署特定流程 |
| **/canary** | 64K | 灰度发布验证 | Setup → Baseline → Page Discovery → Pre-Deploy → Monitoring → Health Report |
| **/investigate** | 72K | Bug 根因调查 | Root Cause → Pattern Analysis → Hypothesis Testing → Implementation → Verification |
| **/office-hours** | 193K | 产品/创意脑暴 | Context → Modes (Startup/Builder) → Premise Challenge → Alternatives → Design Doc |
| **/retro** | 136K | 项目/迭代复盘 | Gather Data → Metrics → Commit Distribution → Hotspots → PR Size → Action Items |
| **/context-save** | 68K | 保存当前工作上下文 | |
| **/context-restore** | 60K | 恢复之前保存的上下文 | |
| **/freeze / /unfreeze** | 12K/8K | 冻结/解冻工作区状态 | |
| **/health** | 68K | 项目健康检查 | |
| **/learn** | 60K | 从项目中学习模式 | |

---

## 三、Skill 之间的路由关系

从源码分析和实际使用中提炼的 Skill 间关系：

```
用户需求
  │
  ├──→ /office-hours（模糊想法 → 清晰方向）
  │
  ├──→ /spec（清晰需求 → 可执行规格）
  │
  ├──→ /autoplan（规格 → 实施计划）
  │
  ├──→ /plan-eng-review（计划 → 审阅通过）
  │
  ├──→ 实施阶段（不通过 Skill，由开发者/AI 直接执行）
  │
  ├──→ /qa（实现 → 质量验证）
  │
  ├──→ /review（变更 → 代码审阅）
  │     ├── PASS → /ship
  │     ├── FAIL → 退回实施
  │     └── BLOCKED → 退回 spec/plan
  │
  ├──→ /ship（审阅通过 → 发布）
  │     ├── → /canary（灰度验证）
  │     └── → /land-and-deploy（生产部署）
  │
  └──→ /retro（发布后 → 复盘）
```

### 路由规则

- `/review` 的 Scope Drift 检测若发现意图不清 → 退回 `/spec` 或 `/office-hours`
- `/review` 的 CRITICAL Finding → 阻止 `/ship`
- `/qa` 产出 TESTING.md 供 `/review` 和后续开发使用
- `/ship` 的 Verification Gate 明确要求：**禁止在无新鲜验证证据的情况下声称完成**
- `/canary` 在 `/ship` 之后运行，是发布后验证

---

## 四、共享基础设施

### bin/ 工具（约 60+ 个）

| 工具 | 用途 | 被哪些 Skill 使用 |
|------|------|-----------------|
| `gstack-config` | 配置读写 | 所有 Skill |
| `gstack-diff-scope` | 分析 diff 范围 | review, qa, ship |
| `gstack-slug` | 项目标识符生成 | 所有 Skill |
| `gstack-repo-mode` | 仓库所有模式检测 | review, ship |
| `gstack-session-kind` | 会话类型检测 | 所有 Skill |
| `gstack-brain-cache` | 跨会话记忆检索 | office-hours, review |
| `gstack-brain-sync` | 记忆同步 | 所有 Skill |
| `gstack-decision-log` | 决策记录 | 所有 Skill |
| `gstack-decision-search` | 决策检索 | review, office-hours |
| `gstack-learnings-log` | 学习记录 | investigate, review, office-hours |
| `gstack-learnings-search` | 学习检索 | investigate, review |
| `gstack-first-task-detect` | 首次任务检测 | 所有 Skill（首次运行） |
| `gstack-review-log` | 审阅结果持久化 | review, ship |
| `gstack-timeline-log` | 时间线记录 | 所有 Skill |
| `gstack-version-bump` | 版本号管理 | ship |
| `gstack-codex-probe` | Codex 可用性检测 | review, spec |
| `gstack-question-preference` | 问题偏好（auto-decide） | 所有 Skill |
| `gstack-question-log` | 问题日志 | 所有 Skill |
| `gstack-developer-profile` | 开发者画像 | office-hours |
| `gstack-brain-context-load.ts` | 脑上下文加载 | office-hours |
| `gstack-community-dashboard` | 社区仪表盘 | |

### 共享模板

- `SKILL.md.tmpl` — 所有 Skill 文档的生成模板
- `slop-scan.config.json` — 代码质量扫描配置

### lib/

- `lib/redact-engine.ts` — 敏感信息过滤（spec 使用）
- `lib/redact-patterns.ts` — 脱敏模式定义
- `lib/gstack-decision.ts` — 决策语义
- `lib/gstack-memory-helpers.ts` — 记忆辅助
- `lib/worktree.ts` — 工作树管理
- `lib/staging-guard.ts` — 暂存区保护

---

## 五、关键输入/产出 Schema

### `/review` 的产物

```
Findings 列表:
  - severity (P1/P2/P3)
  - confidence (1-10)
  - file:line
  - summary
  - fix recommendation
  - category (SQL safety, race condition, LLM trust boundary, etc.)
Quality Score: 0-10
Gate Result: PASS / FAIL / BLOCKED
```

### `/spec` 的产物

```
- 背景与动机
- 需求规格
- Scope / 非目标
- 技术方案
- 实施计划
- 测试策略
- 发布计划
```

### `/ship` 的产物

```
- 版本号
- CHANGELOG 条目
- Git tag
- 发布物
- 指标记录
```

### `/investigate` 的产物

```
- 根因分析
- 修复方案
- 验证结果
- 学习记录
```

---

## 六、能力本体候选索引

从本文档中可以初步识别以下候选：

### Skill 候选（20 个）

全部 20 个顶层命令都是 Skill 候选，其中：
- **第一优先级：** review, qa, ship, spec, investigate
- **第二优先级：** office-hours, autoplan, canary, retro
- **第三优先级：** context-save, context-restore, freeze, health, learn
- **基础设施：** plan-eng-review, plan-ceo-review, plan-design-review, land-and-deploy

### Combo 候选（从 Skills 的步骤模式中识别）

1. **调查 Combo：** 侦察 → 定位 → 假设 → 验证 → 修复
2. **审阅 Combo：** Scope 检查 → 专业分发 → 发现收集 → 修复 → 重新审阅
3. **交付 Combo：** Pre-flight → 合并 → 测试 → 版本 → 提交 → 验证 → 推送
4. **QA Combo：** 框架选择 → 配置 → 首批测试 → CI/CD → 文档
5. **规格 Combo：** Why → Scope → 技术侦查 → 质量门禁 → 归档

### Softill 候选（跨 Skill 重复操作）

1. `change_scope.inspect` — 分析 diff 确定改动范围（review, qa, canary, ship 共用）
2. `codebase.orient` — 理解项目结构、语言、构建系统（所有 Skill 的初始步骤）
3. `test.impact_analysis` — 确定哪些测试受变更影响（review, qa）
4. `finding.classify` — 对发现进行分类和严重程度排序（review, qa）
5. `quality.gate_evaluate` — 判断门禁是否通过（review, ship）
6. `context.restore` — 恢复之前的工作状态（context-restore, 所有 Skill）
7. `evidence.check_freshness` — 验证证据是否仍有效（ship）
8. `plan.compare_to_delivery` — 对比计划和实际交付（review）
9. `release.readiness_check` — 发布就绪状态检查（ship）
10. `documentation.staleness_check` — 文档陈旧性检查（review）
11. `workflow.persist_metrics` — 记录执行指标（ship, review）

### Stage 候选

从 Skill 路由关系中提炼：
- **Intake：** 接收和理解需求（office-hours → spec）
- **Plan：** 方案设计与审阅（spec → autoplan → plan-eng-review）
- **Implement：** 编码实施（不通过 Skill）
- **Verify：** 质量验证（qa, review）
- **Release：** 发布交付（ship, canary, land-and-deploy）
- **Review：** 复盘改进（retro）
