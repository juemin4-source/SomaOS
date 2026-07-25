# LEGACY-ASSET-RECLAIM-REVIEW

> **目标:** 围绕 Review Combo，盘点旧 Soma 资产中已有什么可以直接复用
> **方法:** 扫描三个来源：Foundry `07-verified-softills/`、combo-lab `.claude/softills/`、combo-lab `.claude/skills/`、combo-lab `.claude/combos/`

---

## 总览

| 来源 | 数量 | 其中真实可用的 |
|------|------|--------------|
| Foundry `07-verified-softills/` | 9 | 9（全部 VERIFIED，MCP 工具可用）|
| combo-lab `softills/` | 47 | 29（有实际 handler.mjs）|
| combo-lab `skills/` | 14 | 全部有 SKILL.md |
| combo-lab `combos/` | 11 | 全部有 combo.yaml |

---

## 一、Foundry：9 个 VERIFIED MCP Softill

全部已在 `soma-repo` MCP 服务器中真实运行，当前会话可直接调用。

| Softill | MCP 工具 | 用途 |
|---------|----------|------|
| `soma-file-search` | `mcp__soma-repo__soma_file_search` | 文件内容搜索 |
| `soma-repo-branch` | `mcp__soma-repo__soma_repo_branch` | 分支信息 |
| `soma-repo-diff` | `mcp__soma-repo__soma_repo_diff` | Git diff |
| `soma-repo-fetch` | `mcp__soma-repo__soma_repo_fetch` | 远程获取 |
| `soma-repo-inspect` | `mcp__soma-repo__soma_repo_inspect` | 远程仓库元数据 |
| `soma-repo-log` | `mcp__soma-repo__soma_repo_log` | Git log |
| `soma-repo-status` | `mcp__soma-repo__soma_repo_status` | Git status |
| `soma-repo-update` | `mcp__soma-repo__soma_repo_update` | 受管仓库更新 |
| `soma-repo-verify` | `mcp__soma-repo__soma_repo_verify` | 仓库完整性 |

---

## 二、combo-lab：47 个 Softill（29 个有真实 handler）

### 与 Review Combo 直接相关的

| Softill | Handler | 用途 |
|---------|---------|------|
| `code-review-diff-reader` | 4775B | 读取和结构化 git diff |
| `code-review-evidence-collector` | 3049B | 收集审查证据 |
| `code-review-pattern-matcher` | 5487B | 模式匹配检查 |
| `code-review-report-generator` | 3852B | 生成审查报告 |
| `code-search` | 2226B | 代码搜索 |
| `diff-review` | 2226B | diff 审查 |
| `file-patch` | 2226B | 文件修改 |
| `change-impact-analyzer` | 2281B | 变更影响分析 |
| `git-tools` | 2216B | Git 工具 |
| `context-extractor` | 2256B | 上下文提取 |

### 间接相关

`contract-diff`、`component-inventory`、`permission-compile`、`verify` 等。

---

## 三、combo-lab：14 个 Skill

| Skill | 用途 |
|-------|------|
| `capability-architecture` | **元 Skill：** 判断任务应使用什么能力，辨析旧资产应保留/加载/包装/提炼/组装/验证/隔离 |
| `code-review` | 代码审阅方法论 |
| `combo-design` | Combo 设计方法 |
| `forge-softill` | Softill 铸造 |
| `reuse-gate` | 重用决策门禁 |
| `verification-lead` | 验证方法 |
| `version-lead` | 版本管理 |
| `skill-intelligence-framework` | Skill 智能框架 |
| `dispatch-soma` | 任务分发 |
| `foundry-dispatch-combo` | Foundry 派发 |

### `capability-architecture` 尤其关键

它已经是"元 Skill"——不创建或修改资产，只改变对能力的观察、判断和选择。
其七个概念（Claude、Soma、Organ、Skill、Softill、Combo、Raw Tool）与 V2 本体高度兼容。

---

## 四、combo-lab：11 个 Combo

| Combo | 用途 |
|-------|------|
| `code-review` | **审阅 Combo：** 5 节点（策略选择→上下文收集→diff 分析→模式匹配→报告生成+证据收集）|
| `code-review/fix-combo.yaml` | **修复 Combo：** 与 review 分离，有写权限。解析 findings → 逐个修复 → 验证 |
| `compile-pattern` | 编译模式 |
| `project-inspection` | 项目检查 |
| `research` | 研究 |
| `repository-change` | 仓库变更 |
| `forge-softill` | Softill 铸造 |
| `distill-skill` | Skill 提炼 |
| `dispatch-combo` | Combo 分发 |
| `bootstrap` | 引导 |
| `promote-capability` | 能力晋升 |
| `external-service` | 外部服务 |

### 现有 code-review Combo 的结构

```
nodes:
  1. strategy-select   → code-review-strategy-selector
  2. context-gather    → git-tools + context-extractor + code-search
  3. diff-analysis     → diff-review + change-impact-analyzer + contract-diff
  4. pattern-matching  → code-review-pattern-matcher
  5. report-generation → code-review-report-generator
  6. evidence-collection → code-review-evidence-collector (仅 verified 模式)

parallel: diff-analysis + pattern-matching（最多 2 并发）
security: write_boundary=false, fix_via_separate_combo=true
failure: partial_ok, critical_nodes=[strategy-select]
3 body modes: native / read-only / verified
```

---

## 五、对 Review Combo 的直接影响

原来的 Review Combo 定义（在 `soma-core/src/combo/review.rs` 中）只有 2 个 Skill 和 3 个 Softill。旧资产能直接填补的内容：

### Softill 替换

| 原来写的 | 旧资产替代 |
|---------|----------|
| `gstack-diff-scope` | `diff-review`（有 real handler）+ `soma-repo-diff`（MCP）|
| `gstack-learnings-search` | `code-search`（有 handler）+ `soma-file-search`（MCP）|
| `gstack-review-log` | `code-review-evidence-collector`（有 handler）|

### Skill 增补

- `review-methodology` → 还可以加入 `code-review` Skill 和 `capability-architecture` 的内容
- 新增 `change-impact-analysis` Skill 来自 `change-impact-analyzer`

### Combo 结构参考

旧 `code-review` Combo 的 6 节点 DAG 和 3 body modes 可以直接作为 Review Combo 的工作流程骨架。

### Organ

已有 FileOrgan、GitOrgan、ProcessOrgan 不需要改变。

---

## 六、总结

**不需要从零造 Review Combo。** 旧资产提供了：

- 完整的 6 节点工作流程骨架（code-review combo.yaml）
- 配套的 fix-combo（code-review/fix-combo.yaml）
- 6+ 个可直接使用的 Softill handler
- 9 个可直接调用的 MCP 工具
- 方法论 Skill（capability-architecture、code-review）
- 元 Skill 框架（资产判断和分类）

Review Combo 的 Rust 类型定义（ComboRegistry、Combo struct 等）仍然有效。但 Skill 内容、Softill 绑定、工作流程应该从旧资产继承而非重写。

---

## 对照表：Review Combo 需要什么 → 旧资产有什么

| Review Combo 需要 | 旧资产候选 | 状态 | 处理 |
|---|---|---|---|
| **Softill: 搜索代码** | `soma-file-search` | ✅ VERIFIED，MCP 工具 `soma_file_search` 可用 | 直接复用 |
| **Softill: Git diff** | `soma-repo-diff` | ✅ VERIFIED，MCP 工具 `soma_repo_diff` 可用 | 直接复用 |
| **Softill: Git status** | `soma-repo-status` | ✅ VERIFIED，MCP 工具 `soma_repo_status` 可用 | 直接复用 |
| **Softill: Git log** | `soma-repo-log` | ✅ VERIFIED，MCP 工具 `soma_repo_log` 可用 | 直接复用 |
| **Softill: 仓库分支信息** | `soma-repo-branch` | ✅ VERIFIED，MCP 工具 `soma_repo_branch` 可用 | 直接复用 |
| **Softill: 仓库检查** | `soma-repo-inspect` / `soma-repo-verify` | ✅ VERIFIED | 验证用，按需复用 |
| **Softill: 远程获取** | `soma-repo-fetch` / `soma-repo-update` | ✅ VERIFIED | 按需复用 |
| **Softill: change_scope.inspect** | 无直接对应 | ❌ 不存在 | 需组合现有 Softill（diff + status + search）或新建 |
| **Softill: gstack-diff-scope** | 无直接对应 | ❌ gstack 专有 | gstack 集成或等同替代 |
| **Softill: gstack-review-log** | 无直接对应 | ❌ gstack 专有 | 0.3 先手写 Findings 输出，0.5 再抽象 |
| **Skill: 代码审阅方法** | `codebase-design` / `code-review` / `improve-codebase-architecture` | ⚠️ 需要评估 | 现有方法论内容可部分继承 |
| **Organ: Git** | SomaOS 已有 `GitOrgan` | ✅ 可用 | 直接使用 |
| **Organ: File** | SomaOS 已有 `FileOrgan` | ✅ 可用 | 直接使用 |
| **Organ: Process** | SomaOS 已有 `ProcessOrgan` | ✅ 可用 | 直接使用 |

---

## 关键发现

1. **9 个旧 Softill 全部真实可用**，没有"僵尸资产"。它们通过 `soma-repo` MCP 服务器暴露，当前会话中可以直接调 `mcp__soma-repo__*` 工具。

2. **Review Combo 需要的大部分 Softill 已经存在**——代码搜索、Git diff/status/log/branch 都不需要重写。真正缺失的是：
   - `change_scope.inspect`（组合多个现有 Softill 可得）
   - `gstack-review-log`（0.3 可以直接输出 Findings 文件）

3. **gstack bin 不再是必须的**。原来以为需要接 `gstack-diff-scope` 等工具，但 SomaOS 已有同等或更强的 MCP 工具。

4. **Skill 层面的内容**——旧 `codebase-design` 和 `improve-codebase-architecture` 有可用的架构审阅方法论，可以作为 Review Combo 的 Skill 来源。

---

## 对 0.3 路线的影响

原路线：
```
导入 gstack Review Combo（gstack 黑盒执行）
```

修正后：
```
用 gstack 的 Review 方法论 + SomaOS 已有 Softill + SomaOS 已有 Organ
→ 组成 SomaOS 原生的 Review Combo
```

这比"调用外部 gstack /review"更能证明本体成立。
