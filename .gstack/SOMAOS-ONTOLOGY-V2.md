# SomaOS 能力本体 V2

> **冻结于:** 2026-07-25
> **来源:** gstack 活体样本分析 + Phase 1/2 能力考古
> **取代:** 旧版过度抽象的本体定义

---

## 四层定义

### Skill — 方法论

Skill 是提供给 AI 的方法论、工作流程、领域知识和经验技巧，使 AI 知道某类问题应该如何理解、判断和处理。

Skill **主要改变 AI 的认知和做法**，不负责连接软件或环境。

Skill 可以包含：
- 原则（如 Iron Law：无根因不修复）
- 步骤（如 5 阶段调查法）
- 检查清单（如 10 类审阅标准）
- 判断标准（如 3-Strike 规则）
- 经验模式（如 6 种 Bug 模式）
- 失败处理方式
- 产物要求

同一份 Skill 可以被多个 Combo 使用：
```
root-cause-investigation Skill
├── bug-fix Combo
├── test-failure Combo
├── production-incident Combo
└── performance-regression Combo
```

### Softill — AI 可使用的软件能力

Softill 是 AI 可以调用的软件能力，使 AI 能通过程序完成稳定、可重复的操作。

Softill 可以由 CLI、脚本、API、MCP 工具、本地程序或已有软件适配器实现。

```
Softill = 软件实现（bin/）+ AI 可理解的使用说明
```

需要额外管理的只有：
- 怎么调用
- 输入输出是什么
- 有没有危险副作用
- 结果怎么读回来
- 是否真实可用

gstack 的 `bin/` 就是第一批 Softill 最直接的来源。`bin/gstack-diff-scope` 是脚本文件，当 Soma 知道其能力名称、输入、输出、副作用、使用时机和执行方式时，它才成为 Soma 可使用的 Softill。

### Organ — 环境通道

Organ 是 AI 接触某类真实环境或软件对象的基础通道。

Organ 有限、稳定。Softill 会随任务增长，Organ 是底层基础设施。

现有 Organ:
- File Organ — 文件读写搜索
- Git Organ — 版本控制
- Process Organ — 进程执行

未来 Organ:
- Browser Organ
- Blender Organ
- ComfyUI Organ

一个 Softill 可以调用一个或多个 Organ。一个 Organ 可以被很多 Softill 共用。

### Combo — 完整连招

Combo 是 Skill、Softill 和 Organ 组合形成的完整 AI 工作能力，能够解决某个领域中的一类真实问题或工作流程。

Combo 可以定义：
- 目标和适用场景
- 需要加载的 Skill
- 可以使用的 Softill
- 依赖的 Organ
- 默认工作流程
- 完成标准
- 必要的限制与回退方式

但这些是 Combo 的内部设计，不是 Combo 的本质定义。就像"游戏"不是"状态机和渲染循环的协调关系"，虽然游戏内部确实有这些东西。

```
Combo 的本质定义：
Skill + Softill + Organ → 解决一类真实问题
```

---

## 与 gstack 的映射

| gstack 内容 | SomaOS 身份 |
|------------|------------|
| `/review` | Review Combo |
| `/investigate` | Investigate Combo |
| `/ship` | Ship Combo |
| `/qa` | QA Combo |
| `/spec` | Spec Combo |
| Scope Drift、Fix-First、Iron Law | Skill 内容 |
| `gstack-diff-scope` 等 bin | Softill 或 Softill 的实现 |
| Git、File、Process、Web | Organ |
| Findings、报告、测试结果 | Combo 的工作产物 |
| Skill 之间的跳转 | Combo 之间的衔接 |

gstack 叫它们 Skill，是因为 Claude Code 生态把这种目录统一称为 Skill。那是它的文件格式名称，不是概念定义。在 SomaOS 里，gstack Skill 导入后对应 SomaOS Combo。

---

## 被旧文档错误膨胀的部分

旧设计中以下概念被过度抽象，本次修订明确放弃：

| 旧概念 | 问题 | 新处理 |
|--------|------|--------|
| Combo 是"边界和协调约束的身体配置" | 定义了内部设计而非本质 | Combo 是 Skill+Softill+Organ 的完整连招 |
| Softill 必须和普通软件能力保持距离 | 过度神圣化 | Softill = bin + AI 可用说明 |
| 每种资产必须有互斥边界 | 人为制造分类困难 | 一个 gstack 目录可以同时包含 S/S/O |
| 复杂能力应先解剖再运行 | 阻碍整体使用 | 先整体加载，需要时再抽取 |

---

## 真正留下来的核心

旧设计里真正被 gstack 证明的核心洞察：

> AI 不只有 Prompt 和 Tool。它可以拥有方法、软件能力、身体通道，以及由这些东西组合出的高级工作能力。

Skill + Softill + Organ → Combo → 解决真实研发工作。

这套链没有被 gstack 否定，反而被证明了。

gstack 给出的答案比旧设计更简单：**好的 Combo 就是一套厚实、完整、可直接解决问题的 AI 工作系统。**
