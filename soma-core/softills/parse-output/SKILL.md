---
name: parse-output
description: |
  按 schema 解析 LLM 输出。支持 JSON 解析和文本提取。
  如果解析失败，返回原始文本让上层决定怎么处理。
level: L0_read_probe
triggers:
  - parse output
  - 解析 AI 输出
  - 解析结果
  - 结构化解析
---

# parse-output

## 输入

```json
{ "content": "LLM 返回的原始文本", "schema": { "type": "array", "items": { ... } } }
```

## 输出

```json
{ "status": "valid | repaired | fallback", "data": {}, "rawContent": "..." }
```

## 何时使用

- LLM 返回后需要结构化解析时
- ai-pipeline combo 的第四个（收尾）节点
- 需要从 AI 响应中提取结构化数据时

## 硬规则

1. 不修改原始 content（保留在 rawContent 字段）
2. 解析失败不抛异常——返回 fallback 状态让上层处理
3. 支持 JSON schema 验证

## TS 实现

`lib/ai/structured-parser.ts` — `parseStructuredOutput(input)`
