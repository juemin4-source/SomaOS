---
name: prd-slicer
description: 从 83KB PRD 中按版本切片。保留原文，只切范围。不概括，不压缩，不丢失。
archetype:
  primary: Knowledge
  secondary: [Delivery]
thickness: thin
triggers:
  - slice prd
  - extract version
  - prd section
  - 版本提取
  - prd 切片
  - 读 prd
softill: prd-slicer
---

# prd-slicer

> ⚡ 这是一个 **Softill（可执行技能）**。

实现在 `.claude/softills/prd-slicer/`。
AI 调用协议：读 `skill.json` 了解输入输出。
