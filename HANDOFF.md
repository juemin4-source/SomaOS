# SomaOS Handoff — 2026-07-25

> **会话终点:** 0.8 主链 Combo 全部登记，9 Combos，52 tests
> **下一目标:** GATE-SOMA-FULL-CHAIN-001（全链纵向切片）

---

## 项目状态

```
0.2  执行内核                    ✅ 已发布
0.3  Review Combo               ✅ GATE-SOMA-FIRST-COMBO
0.5  Investigate → Fix → Review ✅ 真实 dogfood 验证
0.7  项目接管与工作连续性          ✅ T1-T3 验证
0.8  gstack 全研发链              ⬜ Gate A 完成，B-E 待推进
0.9  产品化                      ⬜
1.0  日常可用                    ⬜
```

## 0.8 真实进度（诚实分级）

| Gate | 描述 | 状态 |
|------|------|------|
| A | 9 Combo 定义 + 登记 + 中文方法论 | ✅ 52 tests |
| B | Combo 依赖与真实执行（Softill 绑定） | ⬜ 仅 3/9 有 Softill |
| C | 跨 Combo 产物传递 | ⬜ 类型有，管线没接 |
| D | 路由、回退与用户决策 | ⬜ |
| E | 真实功能全链 Dogfood | ⬜ |

## 9 个 Combo

| Combo | ID | Softills | 状态 |
|-------|-----|---------|------|
| 产品方向诊断 | office-hours | 0（纯方法论） | ✅ 中文 |
| 需求规格 | spec | 0（纯方法论） | ✅ 中文 |
| 实施计划 | plan | 0（纯方法论） | ✅ 中文 |
| 方案审阅 | plan-review | 0（纯方法论） | ✅ 中文 |
| 调查 | investigate | 6（MCP + gstack） | ✅ 已有 |
| 代码审阅 | review | 8（MCP + gstack + JS） | ✅ 已有 |
| 质量验证 | qa | 0（纯方法论） | ✅ 中文 |
| 交付发布 | ship | 0（纯方法论） | ✅ 中文 |
| 项目接管 | project-takeover | 4（MCP） | ✅ 已有 |

## 架构关键决策

1. **V2 本体** — Skill = 方法论，Softill = 软件能力，Organ = 环境通道，Combo = S/S/O 完整连招
2. **Hosted Native** — 不追求全 Rust 重写，控制权进入 Soma 即为原生
3. **gstack 作为能力供体** — 方法论继承 gstack，Softill 优先复用旧资产
4. **中文方法论** — 框架书面中文，推压口语化，不翻译
5. **6 个方法论 Combo 当前只是 Skill** — 需通过 Full-Chain Gate 补完 Softill/Organ 绑定

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

1. **GATE-SOMA-FULL-CHAIN-001** — 用 SomaOS 自己的一个功能走通全链
2. 六个方法论 Combo 获得 Softill 绑定和产物传递能力
3. Gate B-E 逐步验收

## 技术债务

- 6 个方法论 Combo 没有 Softill 绑定
- 无跨 Combo 产物传递管线
- 无路由/回退逻辑
- 无真实全链 Dogfood
- stale test DB（已修 `.gitignore`，不会再出现）
