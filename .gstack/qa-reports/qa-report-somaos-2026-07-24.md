# QA Report: SomaOS-Next (Rust CLI)

**Date:** 2026-07-24
**Branch:** main
**HEAD:** bd716c8 (M1 CapabilityRegistry + CLI wiring)
**Type:** Rust workspace (6 crates)
**Tier:** Standard
**Duration:** ~3 min

---

## Test Results

| Crate | Tests | Status |
|-------|-------|--------|
| `soma-capability` | 11 | ✅ |
| `soma-core` (unit) | 4 | ✅ |
| `soma-core` (integration) | 8 | ✅ |
| `soma-store` | 2 | ✅ |
| `soma-model-rig` | 1 | ✅ |
| `soma-model` | 0 | ⚠️ (pure types) |
| `soma-cli` | 0 | ⚠️ (composition root) |
| **Total** | **26** | **✅ 26/26** |

## Lint / Compilation

| Check | Result |
|-------|--------|
| `cargo build` | ✅ 0 warnings |
| `cargo clippy --all-targets` | ✅ 0 warnings (1 fixed) |
| `cargo test` | ✅ 26/26 pass |

## Health Score: 89/100

## Issues

| # | Severity | Title | Location |
|---|----------|-------|----------|
| **1** | Medium | CLI has zero tests | `soma-cli/src/main.rs` |
| **2** | Low | Store has no unit tests | `soma-store/src/` |
| **3** | Low | Registry errors are plain strings | `soma-capability/src/registry.rs` |

### ISSUE-001 — CLI untested
Composition root handles 6 capability registrations, TurnEngine lifecycle, and auto-dispatch. Any wiring regression is invisible to tests. Should add a CLI subprocess smoke test with a fake provider (pattern exists in `soma-core/tests/fake_provider.rs`).

### ISSUE-002 — Store unit test gap
SQLite store has 2 integration tests but 0 unit tests on individual functions. Edge cases (empty replay, corrupted events) uncovered.

### ISSUE-003 — Registry error type
`execute()` returns `Result<Value, String>`. No structured errors for callers to match on. Deferred to M2.

## Fixes Applied

| Fix | Detail |
|-----|--------|
| Clippy `redundant_field_names` | `soma-cli/src/main.rs:147` — shorthand init |

## Summary

```
QA: 26/26 tests, 0 warnings, score 89/100
Fixed: 1 clippy warning
Issues: 1 medium (CLI tests), 2 low
```
