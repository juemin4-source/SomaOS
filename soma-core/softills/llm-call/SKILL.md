---
name: llm-call
description: |
  调 LLM API。单一 fetch 路径，无 Tauri invoke fallback。
  支持 OpenAI 兼容接口和 Google Gemini。
  直接返回原始响应，不做解析（解析由 parse-output 负责）。
level: L0_read_probe
triggers:
  - call llm
  - 调 AI
  - 调用大模型
  - AI 生成
---

# llm-call

## 输入

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "model": { "providerId": "openai", "name": "gpt-4o-mini", "costPer1KTokens": 0.15 },
  "apiKey": "sk-...",
  "timeout": 60000
}
```

## 输出

```json
{ "content": "...", "model": "gpt-4o-mini", "tokensIn": 100, "tokensOut": 200 }
```

## 何时使用

- 需要调 LLM 做 AI 生成时
- ai-pipeline combo 的第三个节点
- 任何需要直接调 AI 的场景

## 硬规则

1. 只用 fetch，不走 Tauri invoke
2. 不解析结果——那是 parse-output 的事
3. 失败就报错，不静默 fallback

## TS 实现

`lib/llm-client.ts` — `callLlm(messages, options)`
