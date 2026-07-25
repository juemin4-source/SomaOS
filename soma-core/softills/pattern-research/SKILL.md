---
name: pattern-research
description: |
  交互模式研究。搜索 GitHub / 网页上的 UI 交互模式实现，
  输出结构化推荐方案。用于设计决策前的调研阶段。
level: L0_read_probe
triggers:
  - pattern research
  - 交互模式调研
  - UI 模式搜索
  - 设计模式参考
  - 组件方案对比
---

# pattern-research

调研 UI 交互模式的流行实现方案，输出结构化推荐。

## 输入

```json
{
  "pattern": "loading state | confirm dialog | empty state",
  "framework": "react",
  "details": "更多上下文"
}
```

## 输出

```json
{
  "pattern": "loading-state",
  "findings": [
    { "source": "radix-ui", "approach": "Suspense fallback", "pros": [], "cons": [] }
  ],
  "recommendation": "推荐方案及理由"
}
```

## 用法

```bash
node handler.js '{"pattern":"loading state","framework":"react"}'
```

## 硬规则

1. 至少查 3 个来源再给结论
2. 推荐必须适配织梦机现有 dark theme + CSS 变量
