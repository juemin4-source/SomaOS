---
name: shadcn-pattern
description: |
  基于 shadcn/ui (113k ⭐) 交互模式生成织梦机组件。
  覆盖：Dialog / AlertDialog / Skeleton / Toast / Sonner / DropdownMenu / Popover / Tooltip
  输出适配织梦机现有 CSS 变量体系的实现代码。
level: L1_transform
triggers:
  - shadcn pattern
  - shadcn 组件
  - 交互组件生成
  - dialog 弹窗
  - alert dialog 确认框
  - skeleton 骨架屏
  - toast 通知
  - dropdown menu 下拉菜单
  - tooltip 提示
---

# shadcn-pattern

根据 shadcn/ui 的交互模式，生成适配织梦机设计体系的组件代码。

## 输入

```json
{
  "component": "skeleton | alert-dialog | dialog | toast | dropdown | tooltip | popover | sonner",
  "adaptTo": "zhimengji",
  "targetDir": "components/ui/"
}
```

## 输出

生成组件代码文件到 `components/ui/`，使用织梦机 CSS 变量：
- `var(--bg-surface)` / `var(--bg-raised)` — 背景
- `var(--accent)` / `var(--accent-soft)` — 强调色
- `var(--border-default)` — 边框
- `var(--text-primary)` / `var(--text-secondary)` — 文字
- `var(--shadow-md)` / `var(--shadow-lg)` — 阴影
- `var(--radius-md)` / `var(--radius-lg)` — 圆角

## 可用组件

| 组件 | shadcn 源 | 织梦机适配 |
|------|----------|-----------|
| `Skeleton` | `div.animate-pulse` → `var(--bg-raised)` | loading 占位 |
| `AlertDialog` | `AlertDialogContent` | 确认/取消对话框 |
| `Dialog` | `DialogContent` | 通用弹窗 |
| `Sonner` | `Toaster` + `toast()` | 通知系统 |
| `DropdownMenu` | `DropdownMenuContent` | 右键/操作菜单 |
| `Tooltip` | `TooltipContent` | hover 提示 |
| `Popover` | `PopoverContent` | 浮层 |

## 硬规则

1. 不引入 npm 依赖 — 代码直接写入项目
2. 所有颜色引用替换为 `var(--xxx)` CSS 变量
3. 保持 shadcn 的 accessible 属性（role、aria-*、focus trap）
4. 每个组件一个文件，放在 `components/ui/` 下
