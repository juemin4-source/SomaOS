---
name: load-prompt
description: |
  从 prompt registry 加载指定 intent 的 AI prompt 模板。
  覆盖所有画板场景：变体生成、读者问答、结构生成、细纲包、正文。
level: L0_read_probe
triggers:
  - load prompt
  - 加载 prompt
  - AI 指令模板
  - 写作提示
  - 生成提示词
---

# load-prompt

按 intent 从 prompt registry 加载 AI prompt 模板。

## 输入

```json
{ "intent": "generateVariants", "canvas": "premise" }
```

## 输出

```json
{ "intent": "generateVariants", "systemPrompt": "...", "userPromptTemplate": "...", "outputSchema": {} }
```

## 何时使用

- AI 需要知道用什么 prompt 来生成内容时
- ai-pipeline combo 的第二个节点
- 需要根据画板类型选择 prompt 时

## 可用 Intent

| intent | 场景 | outputSchema |
|--------|------|-------------|
| generateVariants | 前提变体生成 | PremiseVariant[] |
| generateReaderQA | 读者问答生成 | ReaderQuestion[] |
| generateStructure | 故事结构生成 | StructureNode[] |
| generatePacket | 细纲包生成 | ChapterPacket |
| generateDraft | 正文写作 | string |
| suggestEdit | 修改建议 | Suggestion[] |
| discuss | 自由讨论 | string |

## TS 实现

`lib/ai/prompt-registry.ts`
