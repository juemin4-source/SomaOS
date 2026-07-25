# SomaOS Testing

## Philosophy

测试让 AI 编码安全。没有测试的 vibe coding 是 yolo coding；有测试的 vibe coding 是超能力。

## Test Layers

### Rust (backend — `cargo test`)

| Layer | Location | Command | Count |
|-------|----------|---------|-------|
| Unit | `soma-*/src/*.rs` | `cargo test --workspace --lib` | ~180 |
| Integration | `soma-*/tests/*.rs` | `cargo test --workspace` | 2+ |

Key integration test: `soma-runtime/tests/vertical_slice.rs` — end-to-end AI execution pipeline.

```bash
cargo test --workspace           # 全部测试
cargo test -p soma-runtime       # 仅 runtime 单元测试
cargo test -p soma-core          # 仅 core
cargo test -p soma-protocol      # 仅 protocol
cargo test --test vertical_slice # 仅集成测试（含 AI 执行）
```

### TypeScript (frontend — `vitest`)

| Layer | Location | Command | Count |
|-------|----------|---------|-------|
| Unit | `soma-desktop/src/**/*.test.ts` | `npm test` | ~10 |
| Component | `soma-desktop/src/**/*.test.tsx` | `npm test` | ~9 |

```bash
cd soma-desktop && npm test      # 全部前端测试
cd soma-desktop && npx vitest    # watch 模式
```

## Convention

- 纯函数（reducers, utils）→ 单元测试，覆盖所有分支
- React 组件 → 渲染 + 交互测试，不测试样式细节
- Rust 集成测试 → 验证 JSON-RPC 全流程
- Bug fix → 先写回归测试再修
- 前端新增功能 → 至少补一个 reducer 测试和一个组件测试
