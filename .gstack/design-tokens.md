# SomaOS Desktop — Design Tokens (from Figma API)

> **来源**: Figma "Spatial Workbench" (key: `2ISwgYFvBb7QDEDbp3VIk9`)
> **提取日期**: 2026-07-25
> **页面**: 02 · Foundations → SomaOS Foundations

## Colors

| Token | Hex | Description |
|-------|-----|-------------|
| `--bg-canvas` | `#090B0F` | 空间底层 |
| `--bg-workspace` | `#0D1015` | 主工作面 |
| `--surface-sidebar` | `#11151B` | 导航材质 |
| `--surface-raised` | `#1C222B` | 实体卡片 |
| `--accent-mint` | `#8DE2C4` | 活动与完成 |
| `--accent-blue` | `#86B7FF` | 信息与产物 |
| `--status-warning` | `#E7B969` | 警告与权限 |
| `--status-danger` | `#F18E8B` | 失败与风险 |

Text colors:
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#EEF2F6` | 标题与正文 |
| `--text-secondary` | `#A6AFBA` | 说明文字 |
| `--text-muted` | `#6F7985` | 标签与元信息 |

Ambient glow (from Cover page ellipse blurs):
| Token | Hex | Description |
|-------|-----|-------------|
| `--ambient-mint` | `#31785F` | 左上环境光 |
| `--ambient-blue` | `#315A8C` | 右下环境光 |

## Typography

| Name | Size | Weight | Line Height | Font |
|------|------|--------|-------------|------|
| Display | 32px | 600 | 42px | Inter |
| Title | 20px | 600 | 28px | Inter |
| Heading | 16px | 500 | 24px | Inter |
| Body | 14px | 400 | 22px | Inter |
| Body Small | 13px | 400 | 20px | Inter |
| Label | 12px | 500 | 18px | Noto Sans Malayalam UI |
| Mono | 12px | 400 | 19px | JetBrains Mono |

## Spacing & Layout

| Element | Measurement |
|---------|-------------|
| Sidebar | 272px |
| Window Bar | 42px |
| Task Header | 78px |
| Composer | 108px |
| Drawer | 418px |
| Sidebar padding | 12px 16px header / 4px 0 list |
| Workspace padding | 16px 24px header / 20px 24px content |

## Component Tokens

**Buttons**: `--accent-blue` bg, `--radius-md` (6px)
**Execution Cards**: `--surface-raised` bg, `--bg-workspace` header, `--radius-lg` (8px)
**Tool header**: `--bg-workspace` bg, `--border-color` divider
**Dialog**: `--surface-raised` bg, `--radius-xl` (12px)
**Status dot**: 6px diameter
