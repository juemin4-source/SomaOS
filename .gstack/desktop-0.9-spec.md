# SomaOS Desktop 0.9 — 设计规范

> 来源：Figma 设计稿 "Spatial Workbench"
> 日期：2026-07-25

---

## 一、布局系统

| 区域 | 宽×高 | 说明 |
|------|-------|------|
| 窗口 | 1440×960 | 设计基准尺寸 |
| Window Bar | 1440×42 | 顶栏：身份 + 标题 + 窗口控制 |
| Sidebar | 272×908 | 左侧固定栏 |
| Workspace Main | 1148×908 | 主工作区 |
| Task Header | 1148×78 | 任务头部：标题 + 元信息 + 操作 |
| Conversation | 1148×722 | 消息流主体 |
| Composer | 1148×108 | 底部输入区（含 30px 动作栏） |
| Drawer（覆盖层） | 418×876 | 右侧滑出任务摘要 |

## 二、屏幕清单

| # | 屏幕 | ID | 说明 |
|---|------|-----|------|
| 1 | Cover | 13:2 | 封面页 |
| 2 | **Main Workspace** | 3:2 | 核心——任务工作区，聊天主交互 |
| 3 | **Home** | 6:2 | 首页：模式选择网格 + 最近任务 |
| 4 | **Task Summary Drawer** | 7:2 | 右侧覆盖层：进度 + 产物 + Findings |
| 5 | **Changes** | 18:155 | 三栏 Diff 审阅：文件树 / 编辑器 / 审阅面板 |
| 6 | Artifact Detail | 20:2 | 产物详情：大纲 / 文档 / 元信息 |
| 7 | Capabilities | 24:152 | 能力浏览器：搜索 / 目录 / 详情 |
| 8 | First Run | 23:2 | 首次设置引导（项目路径 + 环境检测） |
| 9–14 | Settings ×6 | — | Runtime / Model & API / Permissions / Env / Data / Updates |

## 三、组件库

来自 Components canvas (02 · Foundations → 03 · Components):

### 基础组件
- Hero
- Buttons（Primary / Secondary）
- Status Badge
- Task Item（带状态图标）
- Pill（带计数）
- Chip
- Avatar / User

### 执行组件
- Execution Cards（Tool Call 卡片）
- Approval Card
- Composer（输入框 + 动作栏）
- Composer Actions（按钮栏）

### 消息组件
- User Message Bubble
- Assistant Intro（Soma 头像 + 回答）
- Tool Card（Header + Divider + 内容）
- Finding（✓ + 说明文字）
- Result Card / Artifact Card / Change Card
- Verification Row（测试标签 + 通过计数）

### 导航组件
- Sidebar Header（Brand + 搜索）
- Nav Item（选中/未选中）
- Project Header
- Task Row
- Profile

## 四、设计系统（Foundations）

来自 Foundations canvas (1440×2470)：

### 色彩
- **环境色**：
  - Ambient Mint: `#3E8067` (rgba 0.24, 0.50, 0.40)
  - Ambient Blue: `#345F91` (rgba 0.20, 0.37, 0.57)
  - 作为背景装饰光晕（blur 190px）
- 更多色值待从 Foundations 页提取

### Typography
- 设计稿使用系统字体
- 字号层级：标题(28px) / 正文(18px) / 标签(14px) / 元信息(12px)

## 五、Workspace States

来自 "04 · Workspace States" canvas，3 行 × 每行 3 状态：

- **Row 1:** 加载 / 空状态 / 初始
- **Row 2:** 思考中 / 工具执行中 / 消息流中
- **Row 3:** 错误 / 中断 / 完成

覆盖了 Codex Desktop 中没有的 **工作状态连续性**——这是 SomaOS 增量。

## 六、关键交互

1. **Sidebar 切换任务** → 右侧 Conversation 切换上下文，保持 WorkState
2. **Composer 输入** → 发送消息 → runtime 流式返回
3. **Tool Card** → 实时显示工具调用状态（started → updated → completed）
4. **Task Summary Drawer** → 从右侧滑出，不离开当前视图
5. **Changes** → 三栏 Diff 审阅，类似 Codex Desktop
6. **Capabilities** → 搜索 + 浏览 Softill，右面板详情

---

*下一步：搭 Tauri + React 骨架。*
