---
name: e2e-summary
description: 跑 E2E 测试，输出结构化 pass/fail 汇总和失败详情。
archetype:
  primary: Diagnostic
  secondary: [Delivery]
thickness: thin
triggers:
  - run e2e
  - e2e test
  - run test
  - 跑测试
  - 验收测试
softill: e2e-summary
---

# e2e-summary

> ⚡ 这是一个 **Softill（可执行技能）**。

实现在 `.claude/softills/e2e-summary/`。
AI 调用协议：读 `skill.json` 了解输入输出。
