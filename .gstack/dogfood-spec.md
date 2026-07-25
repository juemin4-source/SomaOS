# 需求规格：soma pipeline CLI 命令

## 谁受影响
SomaOS 开发者（当前），未来 SomaOS 用户

## 当前行为
- `soma-cli` 只有 `investigate` 和 `resume` 两个子命令
- Pipeline（`soma-core/src/combo/pipeline.rs`）和 Router（`routing.rs`）有完整实现和 30+ 测试，但无 CLI 入口
- 要查看管线状态只能读代码或跑测试

## 期望行为
新增 `soma pipeline` 子命令，两个子命令：

### `soma pipeline describe <query>`
分析查询，显示管线阶段列表及每个阶段的路由决策

输出示例：
```
Pipeline: SomaOS 完整研发主链
Query: "Fix the login bug"

 1. office-hours   → ⏭  Skip (需求明确)
 2. spec           → ⏭  Skip (小型修复)
 3. plan           → ⏭  Skip (小型修复)
 4. plan-review    → ⏭  Skip (小型修复)
 5. investigate    → ▶  Enter (Bug 调查)
 6. implement      → ▶  Enter (修复实施)
 7. review         → ▶  Enter (代码审阅)
 8. qa             → ▶  Enter (质量验证)
 9. ship           → ▶  Enter (交付发布)
```

### `soma pipeline status`
读取 `.somaos/state.json`（WorkState 持久化文件），显示当前管线状态

输出示例：
```
Task: Fix the login bug
Current: investigate (Phase 2: Pattern Analysis)
Stages completed: 0
Artifacts: debug_report
Next suggested: implement
```

## 范围
- 新增 `soma-core` 的 `pipeline` 模块中导出 `render_pipeline_describe()` 和 `render_pipeline_status()` 函数
- 新增 `soma-cli` 的 `pipeline describe` 和 `pipeline status` 子命令
- 不需要连接 Runtime 或 ModelProvider
- 不需要自动执行管线

## 非目标
- ❌ 不实现管线自动执行
- ❌ 不改动现有 `investigate` 和 `resume` 命令
- ❌ 不引入新依赖

## 验收标准
1. `cargo run -- pipeline describe "fix bug"` 输出管线阶段列表
2. `cargo run -- pipeline status` 显示当前状态（无 state.json 时显示提示）
3. 所有测试通过（86+ tests）
