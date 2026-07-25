# SomaOS Handoff — 2026-07-25

> **会话终点:** 0.85 Gate A: 外部插件兼容 ✅ 旧资产批量接入 ✅ — 100 tests
> **下一目标:** 0.85 Gate B: 能力缺口发现 → 先搜索复用 → 再生成 → 验证晋升

---

## 项目状态

```
0.2  执行内核                    ✅ 已发布
0.3  Review Combo               ✅ GATE-SOMA-FIRST-COMBO
0.5  Investigate → Fix → Review ✅ 真实 dogfood 验证
0.7  项目接管与工作连续性          ✅ T1-T3 验证
0.8  完整研发主链                 ✅ Gate A-E 全部完成 — 92 tests
0.85 Softill 开放与生长           ⬜ Gate A 过半，B 待推进
0.9  产品化                      ⬜
1.0  日常可用                    ⬜
```

## 0.8 真实进度（诚实分级）

| Gate | 描述 | 状态 |
|------|------|------|
| A | 9 Combo 定义 + 登记 + 中文方法论 | ✅ 52 tests |
| B | Combo 依赖与真实执行（Softill 绑定） | ✅ 9/9 有 Softill（MCP 工具） |
| C | 跨 Combo 产物传递 | ✅ 管线类型定义 + ArtifactStore + WorkState 集成 |
| D | 路由、回退与用户决策 | ✅ 路由规则系统 + 主链/短路路由 + 22 tests |
| E | 真实功能全链 Dogfood | ✅ `soma pipeline describe` CLI + Runtime 集成，含 1 次真实回退 |

## 9 个 Combo

| Combo | ID | Softills | 状态 |
|-------|-----|---------|------|
| 产品方向诊断 | office-hours | 3（MCP） | ✅ |
| 需求规格 | spec | 6（MCP + vendored JS） | ✅ 旧资产接入 |
| 实施计划 | plan | 5（MCP + vendored JS） | ✅ 旧资产接入 |
| 方案审阅 | plan-review | 5（MCP + vendored JS） | ✅ 旧资产接入 |
| 调查 | investigate | 6（MCP + gstack） | ✅ |
| 代码审阅 | review | 8（MCP + gstack + JS） | ✅ |
| 质量验证 | qa | 6（MCP + vendored JS） | ✅ 旧资产接入 |
| 交付发布 | ship | 6（MCP + vendored JS） | ✅ 旧资产接入 |
| 项目接管 | project-takeover | 5（MCP + vendored JS） | ✅ 旧资产接入 |

## 架构关键决策

1. **V2 本体** — Skill = 方法论，Softill = 软件能力，Organ = 环境通道，Combo = S/S/O 完整连招
2. **Hosted Native** — 不追求全 Rust 重写，控制权进入 Soma 即为原生
3. **gstack 作为能力供体** — 方法论继承 gstack，Softill 优先复用旧资产
4. **中文方法论** — 框架书面中文，推压口语化，不翻译
5. ~~6 个方法论 Combo 当前只是 Skill~~ → ✅ Gate B 已绑定 Softill（MCP 工具）

## 旧资产使用情况

**Foundry MCP（9 个 VERIFIED）：** 用了 4/9（diff、status、log、file-search）
**combo-lab JS handler（29 个）：** 用了 4/29（diff-reader、pattern-matcher、report-generator、evidence-collector）
**gstack bin：** diff-scope、learnings-search、review-log

## 关键文档位置

```
.gstack/
├── SOMAOS-1.0-NORTH-STAR-v2.md        北极星
├── SOMAOS-ONTOLOGY-V2.md              本体定义
├── SOMAOS-ROADMAP-TO-1.0.md           路线图
├── GATE-SOMA-FIRST-COMBO.md           0.3 Gate
├── GATE-SOMA-INVESTIGATE-COMBO.md      0.5 Gate
├── GATE-SOMA-PROJECT-TAKEOVER.md       0.7 Gate
├── GATE-SOMA-GSTACK-FULLCHAIN.md       0.8 Gate（含 5 级验收）
├── legacy-asset-reclaim-review.md      旧资产盘点
├── gstack-capability-map-phase1.md     gstack 能力地图
├── gstack-phase2-three-skills.md       三个 Skill 深度解剖
├── review-report-20260725.md           首次完整 Review 运行
```

## 下一步最短路径

1. **0.9 产品化** — 管线运行时执行器 + 桌面端集成
2. `soma pipeline run` — 半自动管线执行

## 技术债务

- ✅ ~~6 个方法论 Combo 没有 Softill 绑定~~ → 已绑定 MCP 工具（2026-07-25）
- ✅ ~~无跨 Combo 产物传递管线~~ → 已实现 Pipeline 定义 + ArtifactStore（2026-07-25）
- ✅ ~~无路由/回退逻辑~~ → 已实现 Router + 主链/短路路由规则（2026-07-25）
- ✅ ~~无真实全链 Dogfood~~ → FULL-CHAIN-001 完成（pipeline describe，2026-07-25）
- stale test DB（已修 `.gitignore`，不会再出现）
