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

## 0.5 — 研发 Combo 体系成立

**目标：** SomaOS 不再只有一个为 Review 特制的能力。

**至少需要：**
- Review Combo
- Investigate Combo
- Fix 或 Ship Combo
- 复用共同 Softill 和 Organ
- Soma 能根据任务选择 Combo
- Combo 之间可以传递产物

此时才证明本体不是 Review 特例。

---

## 0.7 — 三条研发路径成立

**目标：**
- 路径 A：Bug 调查修复（Investigate → Fix → Review）
- 路径 B：功能交付（Spec → Implement → Review → QA → Ship）
- 路径 C：项目接管（Context Restore → 判断状态 → 继续工作）

重点：研发能力完整，不要求产品体验精致。

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
