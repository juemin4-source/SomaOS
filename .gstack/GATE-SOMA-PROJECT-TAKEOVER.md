# GATE-SOMA-PROJECT-TAKEOVER

## 0.7 — 项目接管与工作连续性

> **状态:** 设计冻结
> **前序:** 0.5 Investigate → Fix → Review ✅
> **一句话目标:** SomaOS 能够恢复或接管一个未完成的软件研发任务，重建必要工作状态，并调用已有 Combo 将其继续推进到完成。

---

## 一、核心用户路径

```
已有代码库
+ 未完成任务
+ 现有改动
+ 历史 Findings / 测试结果
        ↓
Soma 重建当前工作状态
        ↓
判断现在应该调查、修复还是 Review
        ↓
调用已有 Combo 继续工作
        ↓
完成本次增量
```

---

## 二、接管 Combo — project-takeover

不重新实现调查和修复，而是调用 0.5 已经成立的能力。

### 职责

1. **了解项目结构** — 代码库语言、构建系统、测试框架
2. **读取当前分支和未提交改动**
3. **读取已有任务说明、计划、Findings 和测试结果**
4. **判断已经完成了什么** — 当前阶段、已有产物、已解决的问题
5. **识别未完成、失败或阻塞的部分**
6. **决定下一步进入 Investigate、Fix 或 Review**

### Softill

全部复用 0.5 已存在的资产：

| 能力 | 来源 |
|------|------|
| 代码搜索 | `soma-file-search` |
| Git 历史/Diff | `soma-repo-log` / `soma-repo-diff` |
| 文件读取 | FileOrgan / MCP |
| 工作状态恢复 | context-save / context-restore |
| 计划/Findings 读取 | 文件读取 + 结构化解析 |

---

## 三、最小工作状态

不造复杂事件溯源系统。只保留继续工作真正需要的信息：

```
{
  task_goal: "修复 add 函数中的 Bug",
  current_state: "Investigating",
  confirmed_facts: ["根因: a - b 应为 a + b", "测试 test_add_positive 失败"],
  existing_artifacts: [".gstack/debug-report-001.md"],
  pending_findings: [],
  last_test_result: "2 failed, 1 passed",
  modified_files: ["src/lib.rs"],
  pending_decisions: [],
  suggested_next: "code.patch → test.run → review"
}
```

这些内容必须可以保存和恢复，不能只埋在聊天历史中。

---

## 四、验收场景

### T1：恢复自己中断的任务

Investigate 已确认根因，但尚未修复。

**恢复后：** 继续 Fix，而不是重新调查整个项目。

### T2：接管带有 Review Findings 的任务

已有代码修改和未解决 Findings。

**恢复后：** 读取 Findings、完成修复并重新 Review。

### T3：冷接管已有仓库

没有 Soma 会话状态，只有代码、分支改动、任务文档、失败测试。

**恢复后：** 重建足够的工作状态，提出正确的继续路线。

### 不允许

- 用户重新讲一遍此前发生了什么
- 人工复制旧会话摘要
- 人工把 Findings 交给 Fix
- 人工决定当前应该运行哪个 Combo
- 在 SomaOS 外完成主要工作

用户可处理歧义和高风险决定，但不能充当状态传输层。

---

## 五、0.7 验收标准

1. `project-takeover` Combo 可被发现和加载（combo-list / combo-info）
2. 能读取当前仓库状态（分支、改动、测试结果）
3. 能解析已有任务状态（Findings、计划、产物）
4. 能自动建议下一步应调用的 Combo（investigate / fix / review）
5. T1：中断后恢复并继续修复，不重新调查
6. T2：接管带 Findings 的任务并完成修复+重审
7. T3：冷接管后重建状态并提出正确路线
8. 信息不依赖用户充当传输层

---

## 六、不做

- ❌ 不做完整功能开发主链
- ❌ 不导入全部 gstack Combo
- ❌ 不做通用 Workflow Engine
- ❌ 不重建复杂 Event Sourcing
- ❌ 不追求任意历史时点回放
- ❌ 不先做漂亮的任务管理 UI
- ❌ 不要求长时间无人值守运行
