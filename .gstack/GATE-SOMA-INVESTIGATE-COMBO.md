# GATE-SOMA-INVESTIGATE-COMBO

## 0.5 — Investigate + Fix + Review 调查修复主链

> **状态:** 设计冻结，待实现
> **前序:** GATE-SOMA-FIRST-COMBO ✅（Review Combo 成立）
> **路线:** 0.2（执行内核）→ 0.3（Review Combo）→ **0.5（Investigate Combo）**

---

## 一、核心链路

```
用户描述 Bug
→ Investigate Combo
→ 确认根因
→ 实际修改代码
→ 新鲜测试验证
→ Review Combo
→ PASS / FAIL / BLOCKED
```

---

## 二、A：Investigate Combo 定义

### Skill

继承 gstack `/investigate` 的成熟方法：

- 5 阶段调查法（Phase 1 Root Cause → Phase 2 Pattern → Phase 3 Verify → Phase 4 Fix → Phase 5 Report）
- Iron Law：未查明根因前不修复
- 假设建立与验证
- 3-Strike 停止规则（3 个假设失败后 STOP）
- Scope Lock 机制
- Pattern Library（6 种 Bug 模式）
- Debug Report 格式

### Softill

优先复用现有 SomaOS 资产，缺失从 gstack bin 补：

| 所需能力 | 来源 |
|---------|------|
| 代码搜索 | `soma-file-search` (MCP) |
| 文件读取 | `FileOrgan` / MCP |
| Git 历史 | `soma-repo-log` (MCP) |
| Git diff | `soma-repo-diff` (MCP) / `code-review-diff-reader` |
| 测试执行 | `ProcessOrgan` / `test.run` |
| 代码修改 | `file-patch` / `process_run` |
| 结果回读 | `git diff` / `repo-status` |

### Organ

- File Organ
- Git Organ
- Process Organ

### 产出

```
DEBUG REPORT:
  Symptom:   用户观察到的问题
  Root cause: 实际根因
  Fix:       修改的文件和行
  Evidence:  测试输出、复现结果
  Regression test: 新测试的位置
  Status:    DONE / DONE_WITH_CONCERNS / BLOCKED
```

---

## 三、B：端到端链路成立

### 产物传递

| 步骤 | 产出 | 消费方 |
|------|------|--------|
| Investigate | Debug Report | Fix |
| Fix | 代码修改 + 测试结果 | Verify |
| Verify | 测试通过/失败 | Review |
| Review | Findings + Gate Result | 最终结论 |

产物传递和状态衔接由 SomaOS 完成，不允许人工拼接。

### 执行边界

**允许：**
- 用户启动任务
- 用户批准高风险修改
- 用户在需求不明确时作决定
- 用户显式要求进入 Review

**不允许：**
- 人工复制输出给下一步
- 人工写入任务状态
- 人工决定调用哪些 Softill
- 在 SomaOS 外完成修复
- 通过 Claude Code 对话临时拼接整条流程

---

## 四、fix-combo 处理策略

旧 `code-review-fix-combo`（combo-lab）是一个 YAML 定义，尚未验证。

1. 先做一次最小真实验证
2. 若可用，复用骨架和 handler
3. 若局部可用，保留有效节点，缺失由 Softill 补充
4. 若整体不可用，不为了保住资产名称持续修缮
5. 直接使用现有代码搜索、文件修改、进程执行、测试和 Diff Softill
6. 无论哪种，0.5 必须真实修改代码

---

## 五、验收标准

### 能力存在（A）

- `combo-list` 显示 investigate
- `combo-info investigate` 显示 Skill、Softill、Organ
- 产出结构化 Debug Report

### 能力有效（B）

1. 至少一个真实 Bug 被定位到根因
2. 实际代码被修改
3. 修改由 SomaOS 的 Softill 和 Organ 完成
4. 新鲜测试验证修复有效
5. Review Combo 审阅修改
6. Review 失败时能够继续修复并重审
7. 保留完整调查报告

### 体系验证

1. Investigate 与 Review 使用同一套 Combo 基础机制（不建专用管线）
2. 至少复用两个已存在的 Softill
3. 至少复用一个旧 Combo 或其真实执行骨架
4. 至少一个多文件真实 Bug 的 Dogfood

### 不要求

- fix-combo 达到稳定生命周期
- 所有修复经 fix-combo
- 通用修复编排平台
- 多 Combo 路由平台
- 为了迁就 YAML 资产修改新本体

---

## 六、不做

- ❌ 不做通用多 Combo 路由平台
- ❌ 不做 Review Combo 的 Rust Native 重写
- ❌ 不做 Ship / QA / Spec Combo
- ❌ 不做 ComboExecutor 或通用执行抽象
- ❌ 不新建 Organ
- ❌ 不修改 V2 本体
