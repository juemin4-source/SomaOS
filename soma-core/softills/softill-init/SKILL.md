---
name: softill-init
description: 生成新 softill 骨架的工具。现在委托给 meta-softill blueprint 模式。
archetype:
  primary: Delivery
  secondary: [Delivery]
thickness: thin
triggers:
  - create softill
  - new softill
  - 生成 softill
  - 造 skill
  - 造 softill
  - softill init
softill: softill-init
---

# softill-init

> ⚠️ 委托模式（v0.2）
> 现在委托给 `meta-softill blueprint mode=full`。
> 保持向后兼容，行为和输出格式不变。

## 架构变化

```
之前：softill-init 独立生成骨架
现在：softill-init → meta-softill blueprint (full) 委托调用
```

实际实现在 `meta-softill/lib/blueprint.js`。

## 功能（不变）

输入 name + archetype，生成：

- `handler.js` — 完整 CLI 入口
- `skill.json` — SIF 标准 skill 声明
- `SKILL.md` — 使用说明
- `rules.md` — 规则文档
- `tests/softill.test.js` — 测试桩
- `fixtures/` — 测试数据目录

## 用法（不变）

```bash
node handler.js --name my-detector --archetype Diagnostic
```
