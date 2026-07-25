# LEGACY-ASSET-RECLAIM-REVIEW

> **目标:** 围绕 Review Combo，盘点旧 Soma 资产中已有什么可以直接复用
> **方法:** 检查 `07-verified-softills/` 和内建 MCP 工具

---

## 结论：这批旧资产是真金白银

所有 9 个旧 Softill 都是 `VERIFIED` 状态，并且已经在 MCP 服务器 `soma-repo` 中真实运行，当前会话中可以直接调用。

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
