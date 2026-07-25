# 旧 Soma Softill 存活度审计

> **时间:** 2026-07-25  
> **范围:** `G:/AI/Soma-trinity-lab/components/soma/07-verified-softills/`  
> **目的:** 0.85 Gate A 基线 — 摸清旧资产的可接入性

---

## 总览

| 指标 | 数量 | 占比 |
|------|------|------|
| 总目录数 | 135 | 100% |
| 有 handler（.js / .mjs） | **131** | **97%** |
| 有 skill.json（声明文件） | **131** | **97%** |
| 有 SKILL.md（文档） | 18 | 13% |
| 有 rules.md（规则） | 13 | 10% |
| 有 contract.yaml | 1 | 1% |
| 有 tests/ | **4** | **3%** |
| 无 handler | 4 | 3% |

## 无 handler 的目录（4 个）

| 目录 | skill.json | 说明 |
|------|-----------|------|
| `_shared` | ❌ | 共享工具库（connector.mjs, receipt-utils.js），非 Softill |
| `asset-inspect` | ✅ | 纯声明式（contract.yaml），无执行代码 |
| `components` | ❌ | 非 Softill |
| `evidence` | ❌ | 空目录，未实现 |

**结论：135 个 Softill 中 131 个有真实 handler，覆盖率 97%。资产总体存活度极高。**

## Handler 状况

| 指标 | 值 |
|------|------|
| 最小 handler | 488 B（flue-eye） |
| 最大 handler | 28.5 KB（integration-check） |
| 中位数 | ~5 KB（5042 bytes） |
| 四分之一位 | ~2.8 KB |
| 四分之三位 | ~7.1 KB |
| 总代码量（估） | ~18,800 行 JS |

Handler 规模分布健康。大多数是小型、专注的脚本（2-7 KB），少量复杂 Softill（>10 KB）。

## 声明完整性

| skill.json 字段 | 覆盖率 |
|----------------|--------|
| name | 131/131（100%） |
| description | 131/131（100%） |
| type（=softill） | 131/131（100%） |
| runtime（node） | 131/131（100%） |
| entry（handler.js/mjs） | 131/131（100%） |

**key finding：skill.json 中有 description 字段，但没有结构化的 input_schema / output_schema。**  
所有 `skill.json` 只有四字段：name、description、type、runtime、entry。没有声明输入输出结构。

## 测试覆盖（严重缺口）

仅 **4 个** Softill 有 `tests/` 目录：
- receipt-collect
- task-card-issue
- 可能还有 2 个

**131 个有 handler 的 Softill 中，127 个没有自动化测试。**  
这是 0.85 晋升验证时最大的瓶颈——没有测试基线，无法可靠判断候选是否"优于基线"。

## 依赖情况

- **1 个**目录有 `node_modules`（全局 `_shared` 层级）
- 大部分 handler 使用标准 Node.js API + shell 命令，无外部 npm 依赖
- 依赖风险低，迁移成本低

## 按类别分组

从 description 前缀看领域分布：

| 领域 | 数量 | 代表 |
|------|------|------|
| [开发] | ~50 | code-review-*, test-*, db-*, api-* |
| [产品] | ~15 | prd-slicer, handoff-writer, project-* |
| [设计] | ~10 | design-eye, balance-eye, shadcn-pattern |
| [通用] | ~50 | weather-eye, dict-eye, web-fetcher, llm-call |
| 其他扩展 | ~10 | mingli-*, fish-tts, comfy-eye |

## 接入 SomaOS-Next 的可行性判断

### 可以直接接（有 handler + skill.json，纯只读，无外部依赖）
约 **80 个**。其中最优先：

| Softill | 大小 | 所属领域 | 可选 Combo |
|---------|------|----------|-----------|
| code-search | 3 KB | [开发] | review, investigate |
| change-impact-analyzer | 4 KB | [开发] | plan, plan-review |
| context-extractor | 2.5 KB | [产品] | spec |
| diff-review | 10 KB | [开发] | review |
| test-runner | 8 KB | [开发] | qa |
| verify | — | [产品] | qa, ship |
| project-profile-detector | 6.5 KB | [开发] | spec, takeover |
| evidence-collector | 5.5 KB | [产品] | ship |
| file-patch | 19 KB | [开发] | implement |
| schema-validator | 9 KB | [开发] | plan-review |

### 需要修复才能接（handler 存在但依赖缺失或路径问题）
约 **5 个**。

### 不适合接入（纯方法论、复合流程、外部付费 API）
约 **10 个**（capcut-draft、fish-tts、comfy-eye 等）。

## 审计结论

1. **旧资产不是废墟，不是垃圾。** 97% 有 handler，中位数 5KB，13% 有额外文档。它们是 0.85 Gate A 最直接的"待接入外部能力"来源。
2. **但缺少两样东西：测试和结构化声明。** 没有测试就无法验证，没有 input_schema/output_schema 就无法让 Combo 结构化消费。这是接入之前需要补齐的最小缺口。
3. **"兼容插件"的第一步不需要做新东西。** 把这些旧 Softill 的 skill.json 补上 input/output schema，再给每个写一个最小测试，它们就变成了 SomaOS-Next 的 Script Softill——不需要改 handler 代码。
