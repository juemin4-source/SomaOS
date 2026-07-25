# 方案审阅报告

## Verdict: ❌ FAIL — 回退到 Plan

## 发现问题

### 架构违规（CRITICAL）
**问题：** 方案提出将 `soma-core` 添加为 `soma-cli` 的依赖。

**依据：** CLAUDE.md 明确声明 `soma-cli ← 协议客户端（无 Core 依赖）`。
`soma-core` 依赖 tokio、uuid、chrono、soma-model、soma-store 等重 crate，
加入 CLI 会：1) 大幅增加编译时间 2) 违反架构边界 3) 引入不必要的模型层依赖。

### 建议方案
改为通过 `soma-runtime`（已依赖 soma-core）暴露 pipeline 数据：
1. `soma-core` 添加 `render_pipeline_describe()` 和 `render_pipeline_status()` 函数
2. `soma-protocol` 添加 `PipelineDescribeRequest/Response` 和 `PipelineStatusRequest/Response` 类型
3. `soma-runtime` 添加 `pipeline/describe` 和 `pipeline/status` 端点处理
4. `soma-cli` 添加 `pipeline describe` 和 `pipeline status` 子命令，通过 Runtime 调用
