# SomaOS Fixture QA

## Bug Inventory

| ID | Type | File | Summary | Fix |
|----|------|------|---------|-----|
| B1 | Logic | `bug1_logic_offbyone.rs` | Off-by-one: `i < n` should be `i <= n` | Change `<` to `<=` |
| B2 | Logic | `bug2_logic_wrong_comparison.rs` | Wrong comparison: `n % 2 == 1` should be `n % 2 == 0` | Change `== 1` to `== 0` |
| B3 | Runtime | `bug3_runtime_unwrap.rs` | `unwrap()` on `None` config | Add `match` or `unwrap_or` |
| B4 | Runtime | `bug4_runtime_divzero.rs` | Division by zero on empty list | Check `is_empty()` before division |
| B5 | Config | `bug5_config_db_url.rs` | Wrong DB name: `somaos_prod` should be `somaos_dev` | Change `_prod` to `_dev` |
| B6 | Config | `bug6_config_api_version.rs` | Wrong API version: `v1` should be `v2` | Change `v1` to `v2` |

## E2E Test Runner

```bash
cd fixtures
cargo run --release -- investigate "bug1: sum_to_n returns 10 instead of 15"
# Or use the batch runner:
./run-e2e.sh
```
