use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlanReviewVerdict {
    Pass,
    Fail,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanReviewReport {
    pub verdict: PlanReviewVerdict,
    pub findings: Vec<String>,
    pub quality_score: f32,
}

pub fn plan_review_combo() -> Combo {
    let mut combo = Combo::new(
        "plan-review",
        "方案审阅",
        "审查实施计划的架构合理性、风险、测试覆盖和性能影响。Scope gate 先行，确认审查目标后再展开。",
    );

    combo.when_to_use = vec![
        "审查这个方案".into(),
        "帮我 review 一下实施计划".into(),
        "方案审阅".into(),
        "review this plan".into(),
        "plan review".into(),
    ];

    combo.skills.push(Skill::new(
        "plan-review-methodology",
        "方案审阅方法论（源自 gstack /plan-eng-review）",
        "完整的方案审阅流程：从范围确认到架构、代码质量、测试、性能的四段式审查。",
        "审查实施计划或设计方案",
        r#"# 方案审阅方法论

## Scope Gate（硬性停止点）

在开始任何审查工作之前，必须先确认审查目标：
- A) 当前分支的 diff — 正在进行的工作
- B) 一份计划或设计文档
- C) 特定文件或目录

未确认目标前，不得执行任何审查步骤。

## 四段式审查

### 第一段：架构审查

评估：
- 整体系统设计和组件边界
- 依赖图和耦合度
- 数据流模式和潜在瓶颈
- 扩展性和单点故障
- 安全架构（认证、数据访问、API 边界）
- 每个新增路径描述一个真实生产故障场景

### 第二段：代码质量

检查 - DRY：是否重复了现有功能
- 代码是否"工程得够好"——不是 under-engineered（脆弱、hacky），也不是 over-engineered（过早抽象）
- 偏向显式而非巧妙
- 合理的 diff 规模：倾向于能清晰表达改动的最小 diff

### 第三段：测试

- 测试覆盖非可协商
- 新增功能是否包含测试
- 是否处理了边界情况
- 回归风险是否被覆盖

### 第四段：性能

- 是否有性能敏感的变更
- 是否存在 N+1 查询风险
- 是否有不必要的大对象分配
- 缓存策略是否合理

## 认知模式

这些是经验丰富的工程领导者长期积累的模式识别能力：

1. **爆炸半径本能** — 每个决策都问"最坏情况是什么，影响多少系统和人？"
2. **默认无聊** — "每家公司大约只有三个创新代币。"其他一切选择成熟技术。
3. **增量优于革命** — 绞杀者模式，不是大爆炸。金丝雀发布，不是全局上线。
4. **系统优于英雄** — 为凌晨三点疲惫的人设计，不是为状态最好的工程师。
5. **可逆性偏好** — 功能开关、A/B 测试、增量上线。让犯错成本变低。
6. **失败是信息** — 无责备复盘、错误预算、混沌工程。

## 终止条件

- 发现 CRITICAL 级别问题 → 阻止合并
- 存在未解决的 P1 → 不得声称审阅通过
- 范围漂移 → 退回需求澄清阶段
"#,
    ));

    combo.organ_dependencies = vec!["git".into(), "file".into()];

    combo.workflow = r#"方案审阅流程

1. Scope Gate — 确认审查目标
2. 架构审查
3. 代码质量审查
4. 测试审查
5. 性能审查
6. 输出审阅结论（PASS / FAIL / BLOCKED）
"#.to_string();

    combo.completion_criteria = vec![
        "审查目标已确认".into(),
        "四个段位审查已完成".into(),
        "所有 CRITICAL 问题已处理或显式跳过".into(),
        "审阅结论已输出".into(),
    ];

    combo.outputs = vec![
        "PlanReviewReport（verdict, findings, quality score）".into(),
        "审阅发现清单".into(),
        "质量评分（0-10）".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_plan_review_structure() {
        let c = plan_review_combo();
        assert_eq!(c.id, "plan-review");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
    }

    #[test]
    fn test_plan_review_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(plan_review_combo());
        assert!(reg.get("plan-review").is_some());
    }

    #[test]
    fn test_review_report_serialize() {
        let r = PlanReviewReport {
            verdict: PlanReviewVerdict::Pass,
            findings: vec!["架构合理".into()],
            quality_score: 8.5,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("Pass"));
        assert!(json.contains("8.5"));
    }
}
