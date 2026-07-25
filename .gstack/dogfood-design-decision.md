# 设计决策：为 SomaOS CLI 添加管线能力

## 模式
Builder — SomaOS 自身开发

## 关键答案

### 需求真实性
SomaOS-Next 刚完成了 Pipeline 定义（Gate C）和路由规则（Gate D），但没有任何 CLI 或运行时能使用它们。soma-cli 只有 `investigate` 和 `resume` 两个命令，管线能力停留在 Rust struct 层，无法被用户感知。

证据：`soma-cli/src/main.rs` 只有两个子命令，pipeline/routing 模块在 `soma-core` 中但无 CLI 入口。

### 现状
当前管线能力只能通过 Rust 单元测试验证。用户（开发 SomaOS 的人）无法在命令行查看管线状态、阶段列表或路由决策。

### 最小切入点
为 `soma-cli` 添加 `pipeline` 子命令，初期只做描述性功能（show stages, show status），不做自动执行。

### 前提确认
1. ✅ Pipeline + Router 已经 Rust 实现并测试通过（86 tests）
2. ✅ soma-cli 使用 clap 管理子命令，扩展容易
3. ✅ 不需要 ModelProvider 或 Runtime 连接——纯数据操作

## 选定方案
`pipeline describe <query>` + `pipeline status` — 展示管线阶段和路由决策

## 下一步行动
进入 Spec 阶段
