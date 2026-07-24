# GATE-SOMA-GSTACK-EXTRACTION-001

## gstack 能力考古与原生化

> **状态:** 设计阶段
> **供体:** Foundry/.claude/skills/gstack/（已在本机运行的真实研发能力体系）
> **接收方:** SomaOS 研发能力本体
> **原则:** 不凭空设计 Softill/Combo/Skill，从已活着的体系中解剖出来

---

## 为什么是 gstack

gstack 已经在真实研发中长出了：

- 专业任务怎么分（review / qa / ship / spec / investigate 等）
- 什么时候该进入哪个工作方式
- 一次 Skill 承担什么完整责任
- 中间产物怎么传递
- 如何 Review、QA、Ship
- 失败后回到哪里
- 哪些操作值得固化

它不是"参考"——它是**供体**。SomaOS 的第一套研发能力不应由我们坐在桌前设计，而应从 gstack 这套活着的体系里解剖、生长、变异，然后成为自己的器官。

### 关系模型

```
之前（错误）:
  研究 gstack → 总结思想 → 在 SomaOS 里重新设计一套

现在（正确）:
  运行中的 gstack → 能力考古 → 识别真实责任和动作
  → 抽取 Softill / Combo / Skill / Stage
  → Hosted 验证 → 迁入 SomaOS Native
```

---

## 第一阶段：源码地图

扫描 gstack，建立全景图。此阶段只描述，不映射。

### 扫描维度

| 维度 | 说明 |
|------|------|
| 命令 / Skill | 每个可调用的顶层命令（review, qa, ship, spec 等） |
| 入口与路由 | 如何从用户输入路由到对应 Skill |
| Prompt 和规则 | Skill 内部的核心 Prompt 结构和规则声明 |
| 脚本与工具 | 被 Skill 调用的 bin/ 脚本和辅助工具 |
| 产物格式 | Findings、报告、Checkpoint、Plan 等输出产物的 Schema |
| 上下文传递 | Skill 之间如何共享上下文（环境变量、文件、参数） |
| Review/QA Gate | Review 和 QA 的门禁条件与跳转逻辑 |
| 测试与回归 | 如何测试 Skill 本身 |
| 安装与编译方式 | 构建、部署、版本管理 |

### 输出

`gstack-capability-map.md` — 包含每个 Skill 的入口、流程、产物、依赖和上下游关系。

---

## 第二阶段：责任分解

对每个主要 Skill 回答：

### 核心问题

1. **用户交给它什么责任？**
   - 例如 `/review`：用户交给它"判断这次改动是否可以发布"

2. **它必须产出什么？**
   - 例如：Findings 列表（含严重程度）、质量评分、Gate 结果（PASS/FAIL/BLOCKED）

3. **内部有哪些稳定动作？**
   - 每次执行都会做的步骤，不因输入不同而变化

4. **哪些动作跨多个 Skill 重复？**
   - 例如"读取当前改动范围"在 review、qa、canary 中都会出现

5. **哪些步骤会根据结果改变？**
   - 例如 review 发现范围不清 → 跳转到意图确认

6. **哪些决策决定跳转或回退？**
   - 例如 Finding 严重度为 CRITICAL → 阻止 Ship

### 输出

`gstack-responsibility-decomposition.md` — 每个 Skill 的责任卡片。

---

## 第三阶段：四层候选表

从责任分解中提取四类候选：

### Skill 候选

gstack 的顶层命令直接作为 Skill 供体：

- `/office-hours`
- `/spec`
- `/autoplan`
- `/review`
- `/qa`
- `/ship`
- `/canary`
- `/context-save` / `/context-restore`
- `/investigate`

每个 Skill 候选记录：来源、职责、输入、产物、完成条件、可组合的下游 Skill。

### Softill 候选

藏在 Skill 内部的稳定操作。候选条件：

1. 在多个 Skill 或 Combo 中重复出现
2. 有清晰的研发意图
3. 输入输出能够被结构化
4. 执行结果能被后续步骤消费
5. 独立出来后仍具有可复用价值

**正例：** `change_scope.inspect` — 不只是读取 diff，而是产生修改文件、涉及模块、风险区域、受影响测试等结构化产出。

**反例：** `file.read` — 这是 Organ 层操作，不是研发语义能力。

**反例：** `Read the repository and inspect the relevant files` — 这是自然语言指令，不是稳定的能力单元。

### Combo 候选

从 Skill 的真实执行轨迹中提取，不是从文档的命令顺序抄出来。

关注点：
- 多次执行中稳定的节点
- 变化的分支
- 触发回退的条件
- 产物变化

Combo 应从 gstack 源码 + 多次真实运行 Trace + 产物变化 + 分支原因一起提炼。

### Stage / Routing 候选

从 Skill 之间的关系中提取：

- 什么时候进入 office-hours
- 什么时候进入 spec
- Review 发现什么问题会退回
- QA 和 Review 的职责差异
- Ship 前必须确认什么
- Canary 为什么在发布后

这部分可以直接成为 SomaOS "可路由研发阶段体系"的母体。

### 候选表格式

```
## Skill: review

来源:      gstack/.claude/skills/review/SKILL.md
职责:      判断当前改动是否可以发布
输入:      git diff，可选的 PR 描述、计划文件
产物:      Findings 列表 + 质量评分 + Gate 结果
完成条件:  所有 P1 问题已关闭或显式跳过
可组合:    upstream: spec, plan; downstream: qa, ship

## Softill: change_scope.inspect

来源:      review (Step 3), qa (Step 2), canary
职责:      识别当前改动的范围、影响模块和风险区域
输入:      git diff base...HEAD
输出:      { files, modules, risk_areas, test_impact }
复用位置:  review, qa, canary, ship
是否 Native: 候选 — 输入输出清晰，跨 Skill 复用
```

---

## 第四阶段：纵向切片

不一次迁移整个 gstack。选第一刀。

### 候选：Review Finding 处理

推荐理由：

- 同时包含：读取 Findings → 判断成立 → 定位代码 → 修复/拒绝/延后 → 修改 → 验证 → 重新审阅
- 适合长出：多个 Softill、一个动态 Combo、Review 与实施阶段的往返
- 真实可用于当前 SomaOS 开发（你正在使用这个工作方式）
- 不依赖模型的开放探索能力（相比 Bug 调查，边界更清晰）

### 备选：Bug 调查

- 更依赖模型的开放探索，早期更难看清 Softill 边界
- 但 GATE-002 已有基础，可作为第二刀

### 切片流程

1. 选择切片
2. 在当前 gstack（Hosted）环境中运行一次真实任务
3. 记录完整 Trace：每个动作、每步决策、每次跳转
4. 对照候选表，标记哪些候选在 Trace 中出现
5. 实现 Native 版本的第一个 Combo
6. 用同一任务验证

---

## 不做的

- ❌ 不重写 gstack 脚本
- ❌ 不追求"全部 Rust 重写才算 Native"
- ❌ 不一次迁移整个 gstack
- ❌ 不把 gstack 文件结构机械映射为能力本体
- ❌ 不扩建通用 Runtime 基础设施

## Native 标准

某项能力成为 SomaOS 原生能力，取决于：

- Soma 能发现它
- Soma 理解它的责任与输入输出
- Soma 能在合适阶段选择它
- 它能调用 Softill 或子 Combo
- 它的状态与产物属于 Soma 工作对象
- 它能根据反馈调整
- 它不依赖用户手动复制 Prompt 才能运行

即使第一版内部仍通过 Claude Code/gstack 执行，只要控制权、工作状态和能力语义已经进入 Soma，它也可以算"Hosted Native"。

## 产出文档

1. `gstack-capability-map.md` — 源码地图
2. `gstack-responsibility-decomposition.md` — 责任分解
3. `gstack-capability-candidates.md` — 四层候选表
4. 纵向切片实验报告
