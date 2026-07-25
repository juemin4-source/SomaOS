---
name: visual-pipeline
description: |
  MAA 式视觉自动化管道。通过 JSON pipeline 定义截图→找图→点击→判断的完整闭环。
archetype:
  primary: Workflow
  secondary: [Director, Diagnostic]
thickness: medium
triggers:
  - 需要自动化 UI 操作
  - 需要视觉闭环自动化
  - 需要截图 + 找图 + 点击循环
  - 需要 MAA 式任务 pipeline
---

# visual-pipeline

Pipeline JSON 示例：

```json
{
  "name": "打开计算器",
  "templates": ".claude/soma/templates",
  "steps": [
    { "action": "key", "modifier": "win", "key": "r" },
    { "action": "type", "text": "calc" },
    { "action": "key", "key": "enter" },
    { "action": "wait", "ms": 1000 },
    { "action": "screenshot" }
  ]
}
```

条件 + 跳转示例：

```json
{
  "name": "检测错误弹窗",
  "steps": [
    { "action": "screenshot" },
    {
      "action": "condition",
      "if_template": "error_dialog.png",
      "then": [
        { "action": "find", "template": "error_dialog.png",
          "on_found": "click", "timeout": 3000 },
        { "action": "type", "text": "重试" },
        { "action": "key", "key": "enter" }
      ],
      "else": [
        { "action": "type", "text": "一切正常" }
      ]
    }
  ]
}
```
