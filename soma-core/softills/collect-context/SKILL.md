---
name: collect-context
description: |
  从 SQLite 读取指定画板的数据，拼成 AI context。
  支持 5 个画板：premise / structure / setting / packet / text，
  自动带上游画板，确保 AI 有完整上下文。
level: L0_read_probe
triggers:
  - collect context
  - 读画板数据
  - 取上下文
  - 读前提
  - 读结构
  - 读设定
---

# collect-context

从 SQLite 读取指定画板数据，输出结构化的 JSON context。

## 输入

```json
{ "projectId": "uuid", "canvas": "premise | structure | setting | packet | text" }
```

## 输出

```json
{ "canvas": "premise", "data": {}, "upstream": {}, "charCount": 12345 }
```

## 何时使用

- AI 需要当前画板数据来做生成时
- 需要上游画板数据作为上下文时
- ai-pipeline combo 的第一个节点

## 各画板数据

| 画板 | 数据 |
|------|------|
| premise | wishlist, variants, readerQA, genreJudgment |
| structure | structureNodes, edges, layers |
| setting | worldRules, characterCards, factionCards, sparrow |
| packet | chapterPackets, detailMode |
| text | draftContent, packetReferences |

## TS 实现

`lib/ai/context-builder.ts` — `buildContext(input)`
