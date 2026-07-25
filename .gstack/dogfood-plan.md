# 实施计划：soma pipeline CLI

## 第一阶段：管线描述渲染函数（soma-core）

创建 `soma-core/src/combo/pipeline_display.rs`，提供渲染函数：

### `render_describe(query: &str) -> String`
1. 获取主链管线 `main_product_chain()`
2. 扫描查询关键词（"fix"/"bug" → 短路到 bug_fix_chain）
3. 构建 ArtifactStore（模拟存在的产物）
4. 使用 `default_main_chain_router()` 或 `bug_fix_shortcut_router()` 计算每个阶段的决策
5. 格式化为可读输出

### `render_status(project_root: &Path) -> String`
1. 尝试加载 `.somaos/state.json`
2. 如果不存在 → 返回"No active pipeline"
3. 如果存在 → 格式化显示

## 第二阶段：CLI 集成（soma-cli）

修改 `soma-cli/src/main.rs`：
1. 添加 `Pipeline` 子命令枚举
2. 添加 `PipelineDescribe` 和 `PipelineStatus` 变体
3. `pipeline describe` → 调用 `render_describe()`
4. `pipeline status` → 调用 `render_status()`

## 第三阶段：添加测试

在 pipeline_display.rs 中添加测试：
- `test_render_describe_bug_fix`
- `test_render_describe_main_chain`
- `test_render_status_no_state`
- `test_render_status_with_state`

## 架构约束

`soma-cli` 是协议客户端，无 `soma-core` 依赖（CLAUDE.md 架构规则）。
因此 pipeline 显示逻辑通过 Runtime 协议暴露。

依赖链：`soma-cli → soma-client → [stdio JSON-RPC] → soma-runtime → soma-core`

## 决策日志

- 选择纯文本渲染而非 JSON：CLI 输出应人类可读
- 不在 soma-core 中引入终端样式库：保持轻量
- 通过 Runtime 协议暴露而非直接依赖：遵守架构边界
