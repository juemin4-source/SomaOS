use serde::{Deserialize, Serialize};
use super::combo::Combo;
use super::skill::Skill;
use super::softill::{Softill, SoftillInvocation};

/// Office Hours 模式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OfficeHoursMode {
    Startup,
    Builder,
}

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
        "产品方向诊断",
        "产品方向讨论。Startup 模式：六个推压式问题验证需求真实性、现状、切入点和用户观察。Builder 模式：发散式脑暴。",
    );

    combo.when_to_use = vec![
        "讨论一个想法".into(),
        "这个值不值得做".into(),
        "帮我理清思路".into(),
        "产品方向".into(),
        "brainstorm".into(),
    ];

    combo.skills.push(Skill::new(
        "office-hours-methodology",
        "产品方向诊断方法论（源自 gstack /office-hours）",
        "完整 YC 式产品方向诊断：两个模式、六个推压问题、前提挑战、方案生成和设计文档输出。",
        "产品构思、创业方向、设计思考",
        r#"# 产品方向诊断方法论

## 模式选择

Startup 模式：用户在做产品/创业。
Builder 模式：用户在搞 side project / 学习 / 开源。

## ── Startup 模式：六个推压式问题 ──

每个问题单独提出。得到回答后持续推压，直到触及真实答案。

### 问题一：需求真实性

"你最有力的证据是什么——不是'有人感兴趣'，不是'加了心愿单'，而是如果这个东西明天消失了，会有人真的着急？"

推压直到听到：具体行为、有人付钱、有人扩展使用、有人围绕它建了工作流。

红旗信号：
- "大家都说有意思"——说有意思不花钱
- "我们攒了 500 个心愿单用户"——心愿单不是需求
- "投资人对这个赛道很兴奋"——投资人的兴奋不是用户需求

回答后检查三点：
1. 语言精确性：如果对方说"AI 空间""无缝体验"——追问"你说的'无缝'具体指什么？怎么衡量？"
2. 隐藏假设："我需要融资"假设了资本是必要的。"市场需要这个"假设了需求已验证。指出一个假设，追问是否已验证。
3. 真实还是假设："我觉得开发者会想要..."是假设。"我上家公司三个开发者每周花 10 小时在这上面"是真实。

### 问题二：现状

"你的用户现在怎么解决这个问题的——哪怕解决得很烂？这个变通方案让他们付出了什么代价？"

推压直到听到：具体工作流、时间成本、金钱浪费、多套工具粘在一起、专门雇人做这件事。

红旗信号：
- "没有现有方案——这就是机会这么大"——如果真没人做任何事，说明问题还不够痛。

### 问题三：具体用户

"说出那个最需要这个东西的真实的人。ta 的职位是什么？什么事能让 ta 升职？什么事能让 ta 被炒？ta 晚上睡不着在想什么？"

推压直到听到：一个名字、一个角色、一个具体后果（如果问题不解决 ta 会怎样）。

红旗信号：类别级答案——"医疗企业""中小企业""市场团队"。这些是过滤器，不是人。你不能给一个类别发邮件。

### 问题四：最小切入点

"这个产品最小能缩到什么程度——小到这周就有人愿意付钱，而不是等你把平台建好？"

推压直到听到：一个功能、一个工作流、某种一周内能交付的东西。

红旗信号：
- "我们需要先建好完整平台"——如果缩到最小就没有价值，说明价值主张本身不清楚。
- 追问："如果用户什么都不用做——不用登录、不用集成、不用配置——就能获得价值，那会是什么样？"

### 问题五：真实观察

"你有没有真的坐下来，不帮忙，看着用户用这个东西？ta 做了什么让你意外的事？"

推压直到听到：一个具体的意外发现。如果没有任何事让 ta 意外，要么没在看，要么没在意。

红旗信号：
- "我们发了调查问卷"——问卷会撒谎。
- "我们做了几场演示"——演示是演戏。
- "没什么意外的，和预期一样"——"和预期一样"意味着 filtered through existing assumptions。

最有价值的信号：用户拿产品做了你没设计过的事情。那往往才是真正的产品在试图浮现。

### 问题六：未来适配

"如果三年后世界变得很不一样——而且它一定会——你的产品是变得更必需，还是更不必需？"

红旗信号：
- "市场每年增长 20%"——增长率不是愿景。
- "AI 会让一切更好"——这不是产品论点。

## ── Builder 模式：发散式问题 ──

每个问题单独提出。目标是激发创意，不是审问。

1. "这个最酷的版本是什么样的？"
2. "你会给谁看这个？什么能让 ta 说出'哇'？"
3. "最快能让它跑起来的方法是什么？"
4. "现有的什么东西和这个最接近？你的有什么不同？"
5. "如果有无限时间，你会加什么？"

## ── 第三步：前提挑战 ──

在提出方案前，挑战前提：

1. 问题对吗？换个框架会不会有完全不同的解法？
2. 什么都不做会怎样？真实痛点还是假设？
3. 现有代码已经解决了什么？哪些模式和流程可以重用？
4. 汇总前面的诊断证据。支持当前方向吗？缺口在哪里？

输出前提列表，让用户逐条确认。

## ── 第四步：方案生成 ──

至少产生 2-3 个不同的方案。每个包括：名称、一句话概括、工作量、风险、优缺点、重用的代码。

规则：
- 至少一个"最小可行"（最少文件、最小改动、最快交付）
- 至少一个"理想架构"（最佳长期路径）
- 可选一个"创意方案"（意想不到的角度）

## ── 第五步：设计文档输出 ──

结构化设计文档，包含：问题陈述、前提确认、方案对比表、推荐方案及理由、下一步行动。

## 反谄媚规则

绝对不要对这些问题说：
- "这个思路挺有意思" → 直接表态。
- "有很多角度可以考虑" → 选一个，说明什么证据能改变你的判断。
- "这样也许可行" → 说它到底可行还是不可行，缺什么证据。
- "我能理解你为什么这么想" → 如果错了，直接说错在哪里。
"#,
    ));

    // ── Softill: 产品方向诊断所需软件能力 ──
    // 使用 Foundry MCP 工具搜索代码库和历史

    combo.softills.push(Softill::new(
        "soma-file-search",
        "File Search",
        "Search file contents via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_file_search".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-log",
        "Repository Log",
        "Git commit log via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_log".into(),
        },
        "read-only",
    ));

    combo.softills.push(Softill::new(
        "repo-status",
        "Repository Status",
        "Git status via MCP tool. (foundry soma-repo server)",
        SoftillInvocation::McpTool {
            tool_name: "soma_repo_status".into(),
        },
        "read-only",
    ));

    combo.organ_dependencies = vec!["git".into(), "file".into(), "mcp".into()];

    combo.workflow = r#"产品方向诊断流程

1. 模式选择—Startup 还是 Builder
2. Startup: 六个推压问题（逐个提出，推压到真实答案为止）
   Builder: 五个发散式问题
3. 前提挑战
4. 方案生成（至少 2-3 个）
5. 设计文档输出
"#.to_string();

    combo.completion_criteria = vec![
        "模式已确定，问题已回答".into(),
        "前提已由用户确认".into(),
        "至少提出 2 个方案".into(),
        "设计决策已输出".into(),
        "下一步行动已定义".into(),
    ];

    combo.outputs = vec![
        "DesignDecision（模式、关键答案、前提、选定方案）".into(),
        "设计文档（.gstack/*-design-*.md）".into(),
        "下一步行动".into(),
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
        assert_eq!(c.softills.len(), 3);
    }

    #[test]
    fn test_design_decision_serialize() {
        let d = DesignDecision {
            mode: OfficeHoursMode::Startup,
            product_stage: "pre-product".into(),
            key_answers: vec!["用户确认有需求".into()],
            premises: vec!["问题真实存在".into()],
            chosen_approach: Some("先做 MVP".into()),
            design_doc_path: Some(".gstack/design.md".into()),
            assignment: "访谈 5 个用户".into(),
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
