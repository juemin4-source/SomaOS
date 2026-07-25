---
name: capcut-draft
description: |
  从配音音频 + 字幕文案生成剪映草稿。
  依赖 cutsdk（npm install cutsdk）。
  三种模式：voiceover / slideshow / spec。
level: L1_transform
archetype:
  primary: Delivery
  secondary: [Execution]
triggers:
  - 剪映草稿
  - 生成剪映草稿
  - capcut draft
  - 视频草稿
---

# capcut-draft

> 从配音音频 + 字幕文案生成剪映草稿，可在剪映中打开微调。

## 前置条件

```bash
npm install cutsdk
```

## 三种模式

### voiceover — 音频 + 字幕

配音类视频。输入配音音频和字幕时间轴，生成配音轨 + 字幕轨。

```json
{
  "mode": "voiceover",
  "audio": "./output/配音.mp3",
  "captions": [
    {"text": "禹平水土", "start": 0, "end": 3000000},
    {"text": "定九州", "start": 3000000, "end": 5000000}
  ],
  "backgroundImage": "./素材/bg.png"
}
```

### slideshow — 图片轮播 + 音频 + 字幕

适合知识科普类。多张图片按顺序轮播，配音频和字幕。

```json
{
  "mode": "slideshow",
  "audio": "./output/配音.mp3",
  "images": ["./素材/img1.png", "./素材/img2.png"],
  "captions": [
    {"text": "第一句", "start": 0, "end": 3000000}
  ]
}
```

### spec — 直接传入 DraftSpec JSON

完全自定义，直接使用 cutsdk 的 DraftSpec 格式。

```json
{
  "mode": "spec",
  "spec": {
    "version": "1.0",
    "canvas": {"width": 1080, "height": 1920},
    "tracks": [...]
  }
}
```

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | string | 否 | `voiceover`（默认）/ `slideshow` / `spec` |
| `audio` | string | voiceover/slideshow | 配音音频文件路径 |
| `captions` | array | voiceover/slideshow | 字幕数组 `{text, start, end}` |
| `backgroundImage` | string | 否 | 背景图片路径 |
| `images` | array | slideshow | 图片路径数组 |
| `width` | number | 否 | 画布宽，默认 1080 |
| `height` | number | 否 | 画布高，默认 1920 |
| `name` | string | 否 | 草稿名称 |

## 输出

生成的草稿文件夹位于 `output/capcut-drafts/`，复制到剪映草稿目录即可打开。
