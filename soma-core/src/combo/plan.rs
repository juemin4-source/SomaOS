use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImplementationPlan {
    pub title: String,
    pub phases: Vec<String>,
    pub files_to_change: Vec<String>,
    pub risk_assessment: String,
    pub decision_log: Vec<String>,
}

pub fn plan_combo() -> Combo {
    let mut combo = Combo::new(
        "plan",
        "实施计划",
        "根据规格生成可执行的实施计划：拆解步骤、识别风险、记录决策。",
    );

    combo.when_to_use = vec![
        "生成实施计划".into(),
        "拆解实施步骤".into(),
        "plan this out".into(),
        "出实施方案".into(),
    ];

    combo.skills.push(Skill::new(
        "plan-methodology",
        "实施计划方法论（源自 gstack /autoplan）",
        "将规格转化为实施计划：6 项决策原则、决策分类系统、分阶段执行。",
        "生成实施计划或拆解任务",
        r#"# 实施计划方法论

## 六项决策原则

这些原则自动回答所有中间问题：

1. **选择完整性** — 交付完整的方案，选择覆盖更多边界情况的路径。
2. **煮沸湖泊** — 修复方案直接影响范围内的所有问题（方案修改的文件 + 直接引用者）。在影响范围内且工作量小于 1 天 CC 的扩展自动批准。
3. **务实** — 如果两个方案修同样的问题，选更干净的那个。5 秒决定，不是 5 分钟。
4. **DRY** — 与现有功能重复？拒绝。复用已有的东西。
5. **显式优于巧妙** — 10 行明显的修复 > 200 行抽象。选一个新贡献者 30 秒能读懂的那个。
6. **倾向行动** — 合并 > 反复审阅 > 无休止的争论。标记问题但不阻塞。

## 冲突解决

原则之间冲突时，按阶段优先级：
- 产品阶段：P1（完整性）+ P2（煮沸湖泊）优先
- 工程阶段：P5（显式）+ P3（务实）优先
- 设计阶段：P5（显式）+ P1（完整性）优先

## 决策分类

每个自动决策分为三类：

**机械决策** — 只有一个正确答案。自动执行，不询问。
例如：运行 codex（总是要）、运行测试（总是要）、缩减一个完整的方案（从来不）。

**品味决策** — 合理的人可能不同意见。自动执行但给出推荐，在最终门禁时展示。
三种来源：
1. 接近的方案——两个都可行，但取舍不同
2. 边界范围——在影响范围内但涉及 3-5 个文件
3. Codex 分歧——codex 推荐不同且有合理理由

**用户挑战** — 两个模型都认为用户指定的方向应该改变。
永不自动执行。呈现给用户，附上更丰富的上下文：
- 用户说了什么
- 两个模型推荐什么
- 为什么
- 我们可能遗漏了什么
- 如果我们的判断错了，代价是什么

## 阶段执行顺序

阶段必须严格按顺序执行，每个阶段完成后才进入下一个：

1. 理解需求与背景
2. 拆解实施步骤
3. 识别风险与依赖
4. 确定文件和接口变更
5. 记录决策理由
6. 输出实施计划
"#,
    ));

    combo.organ_dependencies = vec!["git".into(), "file".into()];

    combo.workflow = r#"实施计划流程

1. 理解需求与背景（阅读 Spec 或需求描述）
2. 拆解实施步骤（6 项决策原则指导）
3. 识别风险与依赖
4. 确定文件和接口变更
5. 记录决策日志
6. 输出实施计划
"#.to_string();

    combo.completion_criteria = vec![
        "实施步骤已拆解".into(),
        "风险和依赖已识别".into(),
        "决策日志已记录".into(),
        "实施计划已输出".into(),
    ];

    combo.outputs = vec![
        "ImplementationPlan（分阶段实施步骤、文件变更列表）".into(),
        "决策日志".into(),
        "风险评估".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_plan_structure() {
        let c = plan_combo();
        assert_eq!(c.id, "plan");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
    }

    #[test]
    fn test_plan_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(plan_combo());
        assert!(reg.get("plan").is_some());
    }
}
