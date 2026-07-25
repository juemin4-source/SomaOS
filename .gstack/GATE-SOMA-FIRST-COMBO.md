# GATE-SOMA-FIRST-COMBO

## 导入完整 Review Combo

> **状态:** 冻结，准备实现
> **前序:** 本体 V2 已冻结、北极星 V2 已冻结、路径 A 已选择
> **后续顺序:** FIRST-COMBO → COMBO-COMPOSE → MULTI-COMBO

---

## 一、本 Gate 证明什么

> 一个已经成熟的 gstack Combo（/review），能够被 SomaOS 发现、加载、执行、接收结构化产物，并成为 SomaOS 可继续调度的真实能力。

### 不负责证明

- ❌ 任意 gstack Combo 都可以通用导入
- ❌ Skill + Softill + Organ 的任意组合都一定有效
- ❌ 多 Combo 研发路由已经成立
- ❌ SomaOS 已经拥有通用 Combo 平台

---

## 二、验证链

```
用户提出代码审阅任务
→ Soma 选择 Review Combo
→ 加载 Review 方法论 Skill
→ 提供 Review 所需 Softill
→ 接通 Git / File / Process Organ
→ 运行完整 gstack Review
→ 接收结构化 Scope Check、Findings 和 Gate Result
→ 保存为 Soma 工作状态
```

---

## 三、必须证明

1. **Review Combo 有明确身份**，能够被 Soma 自动发现和选择
2. **Skill、Softill、Organ 的依赖可以被解析并加载**
3. **执行不依赖用户手动复制 Prompt 或上下文**
4. **gstack 继续承担成熟 Review 工作**，Soma 不重写其内部流程
5. **Findings、Scope Check、PASS/FAIL/BLOCKED 能被结构化接收**
6. **结果能够改变 Soma 的任务状态：**
   - PASS → Review 通过
   - FAIL → 需要修复
   - BLOCKED → 需要澄清或补充条件
7. **至少在三个不同 Review 场景中重复通过**

### 验收陷阱

Gate 通过的真正标准不是"成功启动了 /review"，而是：

> Review 不再只是 Soma 调用的外部黑盒，而是 Soma 能理解其身份与组成、提供所需能力、接收工作产物并维护后续状态的第一个完整 Combo。

---

## 四、实现范围

### 前置步骤：LEGACY-ASSET-RECLAIM-REVIEW

在新建任何 Combo 零件之前，先盘旧资产中已经有什么可以直接复用。

盘四批：
1. **现有 Organ** — File / Git / Process 已提供哪些能力
2. **现有代码类 Softill** — codebase.search, git.diff, test.run, code.patch 等是否真实可运行
3. **现有 Skill 和元 Skill** — 代码审阅、证据判断、范围控制等方法论
4. **现有 Combo** — 哪些可以直接继承、哪些需要升级、哪些降级为 Skill

交付一张对照表：当前 Review Combo 需要什么 → 旧资产中有什么 → 处理方式（复用/包装/替换/新建）

### 需要做的（经 LEGACY-ASSET-RECLAIM-REVIEW 确认后）

1. **Combo 注册** — Review Combo 有 ID、描述、适用场景，Soma 能发现它 ✅（已完成）
2. **依赖解析** — 能解析 Review Combo 依赖哪些 Skill、Softill、Organ
3. **Skill 加载** — 方法论可在需要时加载（优先复用旧 Skill，不足部分从 gstack 补充）
4. **Softill 接入** — 优先复用 SomaOS 已有真实能力，缺失再接入 gstack bin
5. **Organ 接通** — Git、File、Process Organ 已就位（已有）
6. **执行调度** — Soma 启动 Review Combo 并运行完整流程
7. **产物接收** — Findings、Scope Check、Gate Result 被解析为结构化数据
8. **状态管理** — 结果影响 Soma 的任务状态（PASS/FAIL/BLOCKED）

### 技术方式：混合继承

```
Review Skill：主要继承 gstack 的成熟方法论
Softill：优先复用 SomaOS 已有的真实能力，缺失部分再使用 gstack bin
Organ：继续使用 SomaOS 已有 File / Git / Process
Combo：由 SomaOS 按新本体重新组合
```

不再采用"整个 /review 由 gstack 黑盒执行"的方式。这比单纯调用外部 gstack 更能证明本体成立。

---

## 五、本 Gate 不做

- ❌ 不建设通用 gstack Combo 导入器
- ❌ 不从零组装新 Combo
- ❌ 不实现 review → fix → ship 多 Combo 路由
- ❌ 不重写 gstack Skill 和 bin
- ❌ 不抽象 Combo DSL 或通用工作流引擎
- ❌ 不验证 Skill + Softill + Organ 的任意组合有效性
- ❌ 不验证多 Combo 路由

---

## 六、后续顺序

```
FIRST-COMBO     完整 Review Combo 进入 Soma (← 本次 Gate)
       ↓
COMBO-COMPOSE   基于已有资产组装或改造 Combo
       ↓
MULTI-COMBO     Review、Fix、Ship 形成研发主链
```

通用导入机制不提前建设。等第二、第三个 Combo 导入时发现真实重复后再提炼。
