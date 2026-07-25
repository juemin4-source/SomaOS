---
name: video-script-writer
description: |
  视频文案加工器。三种模式：
  - generate：按模板生成带 Fish Audio 标签的文案
  - polish：把已有文章润色为视频文案（纯文字，无标签）
  - tag：给已润色的纯文字文案嵌入 Fish Audio S2 情感标签
level: L3_write
archetype:
  primary: Creative
  secondary: [Delivery]
triggers:
  - 视频文案
  - 配音脚本
  - fish audio 文案
  - 带语音标签的文案
  - 文案润色
  - 文章转视频文案
---

# video-script-writer

> 视频文案加工器。先润色、再打标，两步拆开。

## 何时使用

- 把文章转为视频配音文案 → `polish` 模式
- 给已润色的文案嵌入 Fish Audio 标签 → `tag` 模式
- 按模板生成带标签的文案 → `generate` 模式
- 输出可直接用于 fish-tts 文字转语音

## 何时不使用

- 不需要语音标签的纯文本写作 → 用 writing-combo
- 需要实际调用 TTS 生成音频 → 用 fish-tts
- 需要创意写作全流程 → 用 creative-writing-combo

## 三种模式

### `polish` — 纯润色

输入已有文章，输出口语化、有节奏的视频文案（纯文字，无标签）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | 填 `polish` |
| `sourceText` | string | 是 | 原始文章 |
| `output` | string | 否 | 输出路径 |

### `tag` — 自动打标

输入已润色的纯文字文案，自动嵌入 Fish Audio S2 情感标签。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | 填 `tag` |
| `sourceText` | string | 是 | 已润色的纯文字文案 |
| `output` | string | 否 | 输出路径 |

### `generate` — 模板生成

按内置模板生成完整文案（含标签）。见下方模板说明。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 否 | `generate`（默认） |
| `template` | string | 否 | 模板名，默认 `story_winter` |
| `custom` | object | 否 | 模板占位变量 |
| `output` | string | 否 | 输出路径 |

## 内置模板

### story_winter
故事写作结构：将藏（起）→ 藏（小寒/大寒）→ 冬的整体
- 冬至：缺憾伏动，展示世界/内心/目标
- 小寒：旧答案卡住，旁支搭巢，警报响起
- 大寒：暗处成熟，外部逼近，资源耗尽

## Fish Audio S2 标签参考

| 标签 | 效果 |
|------|------|
| `[calm]` | 平静 |
| `[soft voice]` | 轻柔 |
| `[low voice]` | 低沉 |
| `[whispering]` | 低语 |
| `[emphasis]` | 强调 |
| `[nervous]` | 紧张 |
| `[worried]` | 担忧 |
| `[hopeful]` | 充满希望 |
| `[determined]` | 坚定 |
| `[sigh]` | 叹息 |
| `[long pause]` | 长停顿 |
| `[pause]` | 停顿 |

完整标签列表见 Fish Audio 官方文档。

## 典型流程

```
原始文章 → polish（纯润色）→ 纯文字视频文案
纯文字视频文案 → tag（自动打标）→ 带标签文案 → fish-tts → 语音
```

## 示例

```json
// 润色
{"mode":"polish","sourceText":"禹平水土，定九州..."}

// 打标
{"mode":"tag","sourceText":"禹平水土，定九州..."}

// 模板生成
{"mode":"generate","template":"story_winter","custom":{"title":"冬：故事承诺藏在旧局里"}}
```

## 硬规则

1. 不修改已有 softill 的 handler.js
2. polish 模式不输出标签，只有纯文字
3. tag 模式只加 Fish Audio S2 bracket 语法标签 `[tag]`
4. 标签放置在所影响文本之前
5. 生成结果不自动调用 fish-tts（需用户自行调用）
