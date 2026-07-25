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

## 四、验收标准

1. 8 个主链 Combo 全部注册（可发现、可选择）
2. 至少 4 个 Combo 的产物可被后续 Combo 消费
3. 用户不需要人工复制 Spec、Plan、Findings 或测试结果
4. Soma 能根据产物状态自动建议或执行阶段跳转
5. 至少成功完成一次真实 Dogfood
6. Dogfood 出现至少一次阶段回退或调整
7. 不支持 Canary/Deploy 时不阻塞主链

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
