use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;

/// Office Hours 的模式选择
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OfficeHoursMode {
    /// Startup: 六个 forcing questions 验证产品方向
    Startup,
    /// Builder: 发散式脑暴，设计师模式
    Builder,
}

/// Office Hours 的产出
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignDecision {
    pub mode: OfficeHoursMode,
    pub product_stage: String,
    pub key_answers: Vec<String>,
    pub premises: Vec<String>,
    pub chosen_approach: Option<String>,
    pub design_doc_path: Option<String>,
    pub assignment: String,
}

pub fn office_hours_combo() -> Combo {
    let mut combo = Combo::new(
        "office-hours",
        "Office Hours",
        "Product design thinking sessions. Startup mode: six forcing questions that expose demand reality, status quo, wedge, and observation. Builder mode: creative brainstorming for side projects.",
    );

    combo.when_to_use = vec![
        "brainstorm this".into(),
        "is this worth building".into(),
        "help me think through".into(),
        "office hours".into(),
        "我想讨论一个想法".into(),
        "这个方案值不值得做".into(),
    ];

    // ── Skill: 完整的 YC Office Hours 方法论 ──
    // 保留 gstack 原版的全部细腻逻辑，不做简化

    combo.skills.push(Skill::new(
        "office-hours-methodology",
        "YC Office Hours Methodology",
        "Full YC office hours: two modes with forcing questions, pushback patterns, premise challenge, and design doc output.",
        "product ideation, startup brainstorming, design thinking",
        r#"# YC Office Hours — 完整方法论

## 模式选择

收到用户问题后，首先确定模式：

- Startup mode：用户在做产品/创业
- Builder mode：用户在搞 side project / 学习 / 开源

## ── Startup Mode（六个 Forcing Questions）──

每个问题通过 AskUserQuestion 单独发出。答完后推压直到获得真实答案。

### Q1: Demand Reality（需求真实性）

问题："What's the strongest evidence you have that someone actually wants this — not 'is interested,' not 'signed up for a waitlist,' but would be genuinely upset if it disappeared tomorrow?"

推压直到听到：具体行为。有人付钱。有人扩展使用。有人围绕它建了工作流。
红旗："People say it's interesting.""We got 500 waitlist signups.""VCs are excited."

答完后检查三件事：
1. 语言精确性：关键术语是否定义清楚。如果用了"AI空间""无缝体验"——追问具体定义。
2. 隐藏假设："我需要融资"假设了资本是必要的。"市场需要这个"假设了需求已验证。指出一个假设并问是否已验证。
3. 真实 vs 假设："我认为开发者会想要..."是假设。"我上家公司三个开发者每周花10小时在这个问题上"是真实。

### Q2: Status Quo（现状）

问题："What are your users doing right now to solve this problem — even badly? What does that workaround cost them?"

推压直到听到：具体工作流。时间成本。金钱浪费。粘合在一起的多套工具。专门雇人做这件事。
红旗："Nothing — there's no solution."如果真没人做任何事，说明问题还不够痛。

### Q3: Desperate Specificity（具体用户）

问题："Name the actual human who needs this most. What's their title? What gets them promoted? What gets them fired? What keeps them up at night?"

推压直到听到：一个名字。一个角色。一个具体后果（如果问题不解决他们会怎样）。
红旗：类别级答案。"医疗企业""中小企业""市场团队"。这些是过滤器，不是人。

### Q4: Narrowest Wedge（最小切入点）

问题："What's the smallest possible version of this that someone would pay real money for — this week, not after you build the platform?"

推压直到听到：一个功能。一个工作流。某种一周内能交付的东西。
红旗："我们需要先建好完整平台。"如果缩减版本没有价值，说明价值主张本身不清楚。

### Q5: Observation & Surprise（真实观察）

问题："Have you actually sat down and watched someone use this without helping them? What did they do that surprised you?"

推压直到听到：一个具体的意外发现。
红旗："我们发了调查问卷。"调查问卷会撒谎。演示是演戏。

### Q6: Future-Fit（未来适配）

问题："If the world looks meaningfully different in 3 years — and it will — does your product become more essential or less?"

红旗："市场每年增长20%。"增长率不是愿景。"AI会让一切更好。"这不是产品论点。

## ── Builder Mode（发散式问题）──

每个问题单独发出。目标是激发创意，不是审问。

1. "What's the coolest version of this?"
2. "Who would you show this to? What would make them say 'whoa'?"
3. "What's the fastest path to something you can actually use or share?"
4. "What existing thing is closest to this, and how is yours different?"
5. "What would you add if you had unlimited time?"

## ── Phase 3: Premise Challenge（前提挑战）──

在提出方案前，挑战前提：

1. 问题对吗？换个框架会不会有完全不同的解决方案？
2. 什么都不做会怎样？真实痛点还是假设？
3. 已有代码解决了什么？哪些模式和流程可以重用？
4. Startup mode：汇总前面的诊断证据，支持当前方向吗？哪里有缺口？

输出前提列表，让用户逐条确认。

## ── Phase 4: Alternatives Generation（方案生成）──

至少产生 2-3 个不同的实现方案。每个包括：
- 名称和一句话概括
- 工作量（S/M/L/XL）
- 风险（低/中/高）
- 优点（2-3条）
- 缺点（2-3条）
- 重用的代码/模式

规则：
- 至少一个"最小可行"（最少文件、最小 diff、最快交付）
- 至少一个"理想架构"（最佳长期路径）
- 可选一个"创意方案"（意外角度）

## ── Phase 5: 设计文档输出 ──

产出结构化设计文档。包含：
- 问题陈述
- 前提
- 方案对比表
- 推荐方案及理由
- 下一步行动

## 反谄媚规则

永远不要在这几个问题上说：
- "That's an interesting approach" → 直接表态
- "There are many ways to think about this" → 选一个并说明什么证据会改变你的判断
- "That could work" → 说它是否会 WORK，以及缺少什么证据
- "I can see why you'd think that" → 如果错了，直接说错了

## 终止机制

如果用户表示不耐烦（"just do it""跳过问题"）：
1. 说："我理解，但这些关键问题是价值所在。让我再问两个，然后推进。"
2. 根据产品阶段问最关键的两个问题。
3. 如果第二次推回，尊重用户意愿，立即推进到 Phase 3。
"#,
    ));

    // Softill: 已有的 repo/log/status/diff 工具可以复用
    // Organ: git, file, process

    combo.organ_dependencies = vec!["git".into(), "file".into()];

    combo.workflow = r#"Office Hours Workflow

1. Mode Selection — Startup or Builder
2. Phase 1: Context Gathering (project info, design docs, learnings)
3. Startup: 6 Forcing Questions (one at a time, push until real)
   Builder: 5 generative questions
4. Phase 3: Premise Challenge
5. Phase 4: Alternatives Generation (2-3 approaches)
6. Phase 5: Design Decision document
"#.to_string();

    combo.completion_criteria = vec![
        "Mode determined and questions answered".into(),
        "Premises confirmed by user".into(),
        "At least 2 alternatives presented".into(),
        "Design Decision produced".into(),
        "Assignment for next step defined".into(),
    ];

    combo.outputs = vec![
        "DesignDecision (mode, key answers, premises, chosen approach)".into(),
        "Design document (.gstack/*-design-*.md)".into(),
        "Assignment for next step".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_office_hours_structure() {
        let c = office_hours_combo();
        assert_eq!(c.id, "office-hours");
        assert!(!c.when_to_use.is_empty());
        assert_eq!(c.skills.len(), 1);
        assert!(c.skills[0].body.len() > 2000, "Skill body must contain full methodology, not a summary");
    }

    #[test]
    fn test_design_decision_serialize() {
        let d = DesignDecision {
            mode: OfficeHoursMode::Startup,
            product_stage: "pre-product".into(),
            key_answers: vec!["user confirmed demand".into()],
            premises: vec!["problem is real".into()],
            chosen_approach: Some("build MVP first".into()),
            design_doc_path: Some(".gstack/design.md".into()),
            assignment: "talk to 5 users".into(),
        };
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("Startup"));
        assert!(json.contains("pre-product"));
    }

    #[test]
    fn test_office_hours_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(office_hours_combo());
        assert!(reg.get("office-hours").is_some());
    }
}
