# SomaOS Roadmap to 1.0

> **冻结:** 2026-07-25
> **原则:** 版本号不等于开发步骤。一个版本有一批用户可感知、值得冻结的能力时再发。

---

## 版本体系

保留较少、较厚的版本。不拆成每个技术模块一个版本号。

```
0.2    执行内核
0.3    第一个完整 Combo
0.5    研发 Combo 体系成立
0.7    三条研发路径成立
0.9    日常产品化
1.0    可长期使用的软件研发能力系统
```

内部增量可以发布 0.3.x、0.4 等，但不预先绑定产品目标。

---

## 0.2 — 执行内核（接近完成）

**目标：** Soma 能执行，但还没有完整研发能力。

**已完成的：**
- 模型调用（DeepSeek 链路已验证）
- File / Git / Process Organ
- Capability 与 Policy/Evidence 治理实验（GATE-001/002）
- CLI → Client → Runtime 三层边界
- Combo/Skill/Softill 类型定义（Catalog）

**收尾标准：** 不再扩建通用 Runtime 基础设施。

---

## 0.3 — 第一个完整 Combo

**目标：** Review Combo 在 SomaOS 中真实可用。

**Pass 标准：**
1. 发现 Review Combo
2. 加载其 Skill
3. 调用其 Softill
4. 接通其 Organ
5. 执行 gstack Review
6. 接收 Findings
7. 更新任务状态（PASS/FAIL/BLOCKED）
8. 三个不同 Review 场景验证通过
9. 在真实项目中可使用

当前 Catalog 只是 0.3 的第一部分，不是 0.3 完成。

---

## 0.5 — Investigate + Fix + Review 调查修复主链

**目标：** SomaOS 拥有一条从用户描述 Bug 到交付修复结论的端到端研发能力链。

**核心链路：**
```
用户描述 Bug
→ Investigate Combo
→ 根因结论
→ 实际修改代码（fix-combo 优先，单个 Softill 兜底）
→ 新鲜测试验证
→ Review Combo
→ PASS / FAIL / BLOCKED
```

### A：能力存在 — Investigate Combo 正式成立

与 Review 同级的 Combo 定义：
- `combo-list` 可发现
- `combo-info investigate` 可查看
- 声明真实 Skill、Softill、Organ
- 产出结构化调查结果（根因、修复、验证）

### B：能力有效 — 端到端链路成立

产物传递和状态衔接由 SomaOS 完成，不允许人工拼接。
至少一个真实多文件 Bug 验证，保留完整记录。

### Softill 复用

优先使用现有 SomaOS 资产：代码搜索、Git 历史/Diff、测试执行、文件修改、结果回读。缺失从 gstack bin 补充，不重复制造同类能力。

### fix-combo 处理

优先验证旧 fix-combo（combo-lab code-review-fix-combo）。若不可用，降级为单个 Softill 修复。无论哪种，0.5 必须真实修改代码。

### 验收标准

1. Investigate Combo 可被发现、加载和执行
2. 与 Review 使用同一套 Combo 基础机制
3. 至少复用两个已存在的 Softill
4. 至少复用一个旧 Combo 或执行骨架
5. 能对真实 Bug 形成结构化根因、修复和验证结果
6. 调查结果可以进入修复
7. 修复结果可以进入 Review
8. 至少一个多文件真实 Bug 的 Dogfood

---

## 0.7 — 项目接管与工作连续性

**目标：** SomaOS 能够恢复或接管一个未完成的软件研发任务，重建必要工作状态，并调用已有 Combo 将其继续推进到完成。

**核心能力：**
- `project-takeover` Combo：了解项目、读取状态、判断阶段、选择下一步
- 最小工作状态（JSON 可保存/恢复）
- 跨会话恢复：不需要用户重述上下文

**验证场景：**
- T1：恢复自己中断的任务（继续修复，不重新调查）
- T2：接管带 Review Findings 的任务
- T3：冷接管已有仓库（无 Soma 会话状态）

### 后续版本

| 版本 | 目标 |
|------|------|
| 0.8 | 从需求到完整功能交付（Spec → Plan → Implement → QA → Ship） |
| 0.9 | 日常产品化与体验收口 |
| 1.0 | 三条研发路径重复可用 |

---

## 0.8 — gstack 全研发链（Idea → Spec → Plan → Build → Review → QA → Ship）

**目标：** SomaOS 能运行从需求澄清到实施、审阅、测试、交付和复盘的完整专业研发链。

**主链 Combo（8 个）：**
- office-hours（模糊想法 → 方向）
- spec（范围与需求）
- plan（实施方案）
- plan-review（工程审查）
- investigate（✅ 已有）
- review（✅ 已有）
- qa（验证行为）
- ship（版本与交付）

**核心交付物：**
1. 8 个主链 Combo 全部注册
2. 统一工作产物（Spec/Plan/Findings/Test Result/Release）
3. 产物跨 Combo 自然传递，不人工复制
4. 路由与回退（跳过、回退、阻塞）
5. 一条真实 Dogfood（含阶段回退）

---

## 0.9 — 日常产品化

**目标：**
- 成熟 Coding Agent 交互
- 流式输出
- 用户可随时打断和纠正
- 任务和会话恢复
- Diff、测试、Findings 清晰可见
- 安装、配置、模型接入可接受
- 长任务稳定
- 用户不需要理解本体术语

---

## 1.0 — 可长期使用的软件研发能力系统

**发布标准：**
1. 三条路径（A/B/C）均可在真实项目中重复完成
2. 用户可以打断、纠正、恢复和继续
3. 多个 Combo 能共享产物并衔接
4. Skill、Softill、Organ 能真实组成可用 Combo
5. 用户愿意长期使用 SomaOS 开发 SomaOS
