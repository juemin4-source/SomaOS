---
name: worker-spawn
description: |
  Spawn an external worker Claude Code session (no worktree, no inline agent)
level: L4_state
triggers:
  - worker-spawn
  - worker spawn
---

# worker-spawn

Spawn an external worker Claude Code session with task goal.

**v0.3 更新：去掉了 worktree 依赖，不再需要 `.soma/session.json` 初始化。**
**直接给 outputDir 即可工作，启动外部独立 claude 进程而非内联 agent。**

## 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| outputDir | 是 | 工作目录（不存在会自动创建） |
| goal | 是 | 任务目标描述 |
| role | 否 | 角色（默认 worker） |
| taskId | 否 | 任务 ID |
| hardRules | 否 | 硬规则列表 |
| reportPath | 否 | 报告输出路径 |

## 输出

返回启动配置 `launchConfig`，包含 `launchCommand` 和 `shellCommand` 供外部执行。

## 硬规则

1. 不依赖 worktree 初始化
2. 不启动内联 agent
3. 生成外部 Claude Code 进程的启动命令
