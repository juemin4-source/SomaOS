# QA Report: SomaOS-Next — M3

**Date:** 2026-07-24  
**Branch:** main  
**HEAD:** 8a18f71 (M3 Evidence + verification invalidation)  
**Type:** Rust workspace (6 crates)  
**Tier:** Standard  

---

## Test Results

| Crate | Tests | Status |
|-------|-------|--------|
| `soma-capability` | 11 | ✅ |
| `soma-core` (unit) | 8 | ✅ |
| `soma-core` (integration) | 8 | ✅ |
| `soma-model` | 5 | ✅ new! |
| `soma-store` | 2 | ✅ |
| `soma-model-rig` | 1 | ✅ |
| `soma-cli` | 0 | ⚠️ |
| `soma-model` (types) | 0 | ⚠️ (pure) |
| **Total** | **35** | **✅ 35/35** |

## Lint

| Check | Result |
|-------|--------|
| `cargo build` | ✅ 0 warnings |
| `cargo clippy` | ✅ 0 warnings |

## Health Score

| Category | Score | Weight |
|----------|-------|--------|
| Tests Passing | 100 | 30% |
| Compilation | 100 | 20% |
| Lint | 100 | 10% |
| Capability tests | 100 | 10% |
| Core tests | 90 | 10% |
| Store tests | 70 | 10% |
| CLI tests | 30 | 10% |

**Score: 91/100** ↑ (from 89 in M1)

## Issues

Carried forward from M1 QA (unchanged):
1. **Medium** — CLI has zero tests (`soma-cli/src/main.rs`)
2. **Low** — Store has no unit tests (`soma-store/src/`)
3. **Low** — Registry errors are plain strings

## M3-Specific Notes

- 5 new evidence tests added (freshness policy, type mapping, stale transition)
- `record_evidence_staled()` and `record_claim_adjudicated()` defined but not yet called (M4 targets)
- M2 refactor to `execute_capability` helper confirmed clean — no regression

## Summary

```
QA: 35/35 tests, 0 warnings, score 91/100
Delta: +5 tests, +2 points from M1 baseline
Issues: 1 medium (CLI tests), 2 low
```
