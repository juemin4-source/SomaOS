# GATE-SOMA-GSTACK-FULLCHAIN

## 0.8 — gstack 全链路原生化

> **状态:** 设计冻结
> **一句话目标:** SomaOS 能运行从需求澄清到实施、审阅、测试、交付和复盘的完整专业研发链。

---

## 一、产品主链

```
用户提出模糊需求
  → Office Hours Combo  → 设计决策
  → Spec Combo          → 规格文档
  → Plan Combo          → 实施方案
  → Plan Review Combo   → 审查结论
  → Implement           → 代码修改 + 测试
  → Review Combo        → Findings + Gate
  → QA Combo            → 验证结果
  → Ship Combo          → 版本 + 发布
  → Retro / Learn       → 复盘记录
```

条件性延伸（视项目能力）：Canary / Land-and-Deploy

---

## 二、主链 Combo（8 个必须进入）

| Combo | 来源 | 职责 |
|-------|------|------|
| office-hours | gstack | 模糊想法 → 清晰方向、关键决策 |
| spec | gstack | 范围、非目标、需求、验收标准 |
| plan | gstack | 实施方案与步骤 |
| plan-review | gstack | 审查工程方案 |
| investigate | ✅ 已有 | Bug 调查根因 |
| review | ✅ 已有 | 审查实现与 Scope Drift |
| qa | gstack | 验证真实行为 |
| ship | gstack | 版本、提交、验证和交付 |

Implement 不对应单一 gstack Skill，由 SomaOS 已有 Softill 和 Organ 完成。

---

## 三、核心交付物

### 1. 完整 Combo 集

8 个主链 Combo 全部成为 SomaOS 正式资产（combo-list / combo-info 可发现）。

### 2. 统一工作产物

至少 7 种结构化产物类型，可保存和传递：

```
Design Decision
Spec
Implementation Plan
Change Set
Findings
Test Result
Release Result
```

### 3. 路由与回退

Soma 能根据产物和结果决定：继续、跳过、回退、阻塞、等待用户决定。

```
需求明确 → 跳过 office-hours
小型修复 → investigate → fix → review（不进入 spec/plan）
Scope Drift → 回到 spec
QA 发现行为错误 → 回到 investigate 或 implement
Ship 缺少新鲜证据 → 回到 QA
```

每个 Combo 声明：需要什么输入、产生什么产物、可能进入哪里、什么情况下阻塞或回退。

### 4. 一条真实 Dogfood

SomaOS 自己的中等规模功能，完整走一遍主链。期间至少出现一次真实回退或计划调整。

---

## 四、验收标准（诚实分级）

### Gate A：Combo 定义与登记 ✅
九个主链 Combo 的 Rust struct 定义、中文方法论、注册到 ComboRegistry。
当前状态：✅ 已完成（52 测试）

### Gate B：依赖与真实执行 ⬜
每个 Combo 声明真实的 Softill 和 Organ 依赖，并能通过 Runtime 管线调用。
当前状态：⬜ 仅 review / investigate / project-takeover 有 Softill 绑定，其余 6 个为"纯方法论"

### Gate C：跨 Combo 产物传递 ⬜
上一阶段的产物自动成为下一阶段的输入，用户不需要复制粘贴。
当前状态：⬜ 产物类型已定义，传递管线未实现

### Gate D：路由、回退与用户决策 ⬜
Soma 能根据产物状态决定继续、跳过、回退、阻塞。
当前状态：⬜

### Gate E：真实功能全链 Dogfood ⬜
用一个真实功能完整走一遍 office-hours → spec → plan → plan-review → implement → review → qa → ship，至少出现一次真实回退。
当前状态：⬜

---

## 五、GATE-SOMA-FULL-CHAIN-001

### 目标
拿 SomaOS 自己的一个中等功能，从头到尾走通全链。

### 必须满足
1. 用户不用复制上一阶段的文本
2. 每个阶段能读取上一阶段产物
3. 实施阶段真实调用 Softill 和 Organ
4. Review/QA 的失败能退回实施
5. Ship 必须读取最新测试与 Review 结果
6. 至少发生一次真实调整或回退
7. 最终产生一个真实提交或可交付增量

---

## 五、不做

- ❌ 不要求 gstack 全部用 Rust 重写
- ❌ 不要求所有 gstack 命令全部导入
- ❌ 不要求无人值守自动跑完整链
- ❌ 不一次设计通用 Combo DSL
- ❌ 不把 gstack 源码结构原封不动复制
- ❌ 不为全链路抛弃 SomaOS 已有 Skill、Softill 和 Organ

---

## 六、版本线

```
0.2  执行内核               ✅
0.3  Review Combo           ✅
0.5  Investigate→Fix→Review ✅
0.7  项目接管与连续性        ✅
0.8  gstack 全研发链         ⬜ 本 Gate
0.9  产品化                  ⬜
1.0  日常可用                ⬜
```
