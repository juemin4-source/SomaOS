# SomaOS 1.0 北极星 V2

> **冻结:** 2026-07-25
> **状态:** 产品方向 + 能力本体已冻结，下一阶段 Gate 待最终确认
> **前序文档:** SOMAOS-ONTOLOGY-V2.md（本体定义）、GATE-SOMA-GSTACK-EXTRACTION-001（能力考古）

---

## 一、产品定位

SomaOS 1.0 是面向软件研发的 AI 能力工作系统。

**前台表现：** 一个成熟、可靠的 Coding Agent。用户输入研发任务，Soma 流式工作——读代码、执行命令、修改文件、运行测试。用户可以随时打断、补充、纠正和继续。错误不会轻易破坏整个任务。会话可以恢复。

**后台核心：** 可加载、可组合、可积累的研发能力体系。Soma 不是从零开始的 Prompt 机器，它拥有专业方法（Skill）、软件能力（Softill）、环境通道（Organ），并能将它们装配成完整的领域工作能力（Combo）。

### 聚焦范围

仅软件研发。不解决创作、设计或其他专业领域的通用问题。

---

## 二、能力体系（V2 本体）

```
Skill    — 方法论、流程、领域知识
Softill  — AI 可调用的软件能力
Organ   — 接触真实环境的通道
Combo   — Skill + Softill + Organ 打出的完整连招
```

### Skill

提供给 AI 的方法论、工作流程、领域知识和经验技巧，使 AI 知道某类问题应该如何理解、判断和处理。

Skill **主要改变 AI 的认知和做法**，不负责连接软件或环境。

可以包含：原则、步骤、检查清单、判断标准、经验模式、失败处理方式、产物要求。

同一份 Skill 可以被多个 Combo 使用。

### Softill

AI 可以调用的软件能力，使 AI 能通过程序完成稳定、可重复的操作。

Softill 可以由 CLI、脚本、API、MCP 工具、本地程序或已有软件适配器实现。

```
Softill = 软件实现（bin/）+ AI 可理解的使用说明
```

真正需要管理的只有：怎么调用、输入输出、副作用、结果回读、是否真实可用。

gstack 的 `bin/` 是第一批 Softill 最直接的来源。

### Organ

AI 接触某类真实环境或软件对象的基础通道。

Organ 有限、稳定。Softill 会随任务增长，Organ 是底层基础设施。

现有：File Organ、Git Organ、Process Organ。
未来：Browser Organ、Blender Organ 等。

### Combo

Skill + Softill + Organ 组合形成的完整 AI 工作能力，能够解决某个领域中的一类真实问题或工作流程。

Combo 可以定义目标、需要加载的 Skill、可用的 Softill、依赖的 Organ、默认工作流程和完成标准——但这些是内部设计，不是本质定义。Combo 的本质是：**把方法、能力和通道组合起来，让 AI 能完整做好一类工作。**

---

## 三、gstack 与 SomaOS 的关系

```
gstack（能力供体）         SomaOS（能力继承者）
─────────────────         ──────────────────
/review /investigate       Combo
/ship /qa /spec
   │
   ├── 方法论、原则        Skill
   ├── bin/ 工具           Softill
   ├── Git/File/Process    Organ
   └── 工作流程            Combo 内部设计
```

gstack 叫它们 Skill，是因为 Claude Code 生态把这种目录统一称为 Skill。那是文件格式名称，不是概念定义。

在 SomaOS 里：

- gstack Skill 导入后 → **Combo**
- gstack 的方法论和原则 → **Skill**
- gstack 的 bin 工具 → **Softill**
- gstack 依赖的 Git/File/Process → **Organ**

### 双层路线

```
Claude Code + gstack（继续运转，作为能力供体和开发环境）
     │
     └── 能力考古 → 抽取 Softill/Combo → 注册到 SomaOS
                 → SomaOS 逐步获得原生研发能力
                 → gstack 可能长期保留为兼容层
```

不追求"全部用 Rust 重写才算原生"。控制权、工作状态和能力语义进入 Soma 即为原生，即使第一版仍通过 gstack 执行。

---

## 四、1.0 差异化

SomaOS 1.0 与现有 Coding Agent 的核心差异：

| 维度 | 现有 Coding Agent | SomaOS 1.0 |
|------|------------------|------------|
| 能力组织 | 平铺的 Tool 列表 | 分层的 Skill + Softill + Combo |
| 工作方法 | 取决于当前 Prompt | 可加载的专业方法论 |
| 能力复用 | 无（每次重新描述） | Softill 可发现和调用 |
| 工作连续性 | 每次会话从零开始 | Combo 可保存和恢复 |
| 领域覆盖 | 通用但浅 | 软件研发专业且深 |

差异化不通过展示系统复杂度来体现。前台保持 Coding Agent 的自然交互，后台能力逐步积累。

### 渐进式显露原则

- **默认可见：** 当前任务、工作阶段、修改文件、测试结果
- **按需展开：** 为什么进入当前阶段、用了哪些 Softill、Combo 如何调整
- **内部术语映射：** Combo → 工作计划；Softill → 使用的能力；Organ → 环境通道

---

## 五、下一阶段 Gate

### Gate 名称

**GATE-SOMA-FIRST-COMBO**

### 要证明什么

Skill + Softill + Organ → Combo → 解决真实研发工作。

不是再次证明治理链（GATE-002 已证明），而是证明能力体系能完整运行。

### 候选路径

```
A. 导入完整的 Review Combo（gstack /review 整体接入 SomaOS）
B. 证明 gstack Combo 可以普遍导入 SomaOS
C. 用 Skill + Softill + Organ 组装出一个新 Combo
D. 证明 Soma 能在多个 Combo 之间路由完整研发工作
```

**Gate 需要决策：** 这四个候选对应不同的验证目标、工程量和风险。必须在北极星锁定后明确选择。

### 验收标准

1. Soma 能发现一个 Combo，知道它解决什么问题
2. Soma 能加载该 Combo 需要的 Skill
3. Soma 能暴露并调用其 Softill
4. Soma 能接通所需的 Organ
5. Soma 能执行完整工作流程并接收产物
6. Soma 能根据结果路由下一步
7. 用户感知是一个自然、成熟的 Coding Agent

---

## 六、Immediate Next（北极星锁定后）

1. 确认下一阶段 Gate 的路径选择（A/B/C/D）
2. 编写 Gate 规格（参考 GATE-001/002 格式）
3. 进入实现阶段

在此之前，不动代码。

---

## 七、Scope Control

### 明确不做什么

- ❌ 不建通用分布式工作流平台
- ❌ 不建企业级身份与权限系统
- ❌ 不建通用多 Agent 平台
- ❌ 不建多租户云服务
- ❌ 不自研 MCP、ACP 或模型协议
- ❌ 不重写 gstack（除非必要）
- ❌ 不追求"全部 Rust 重写才算原生"
- ❌ 不把 Softill 做成比 bin 更重的资产格式

### 范围控制规则

每当提出新底层系统时，必须回答：
1. 直接支撑哪条用户路径？
2. 不建设它会具体阻断什么？
3. 有没有更简单的替代方案？
