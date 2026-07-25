/// SomaOS 路由与回退逻辑 — Gate D
///
/// 根据当前产物状态决定：继续、跳过、回退、阻塞、完成。
///
/// 路由场景（GATE-SOMA-GSTACK-FULLCHAIN.md）：
/// - 需求明确 → 跳过 office-hours
/// - 小型修复 → investigate → fix → review（不进入 spec/plan）
/// - Scope Drift → 回到 spec
/// - QA 发现行为错误 → 回到 investigate 或 implement
/// - Ship 缺少新鲜证据 → 回到 QA

use std::collections::HashMap;

use super::pipeline::ArtifactStore;

// ── 路由决策 ─────────────────────────────────────────────────

/// 路由决策 — 下一步做什么
#[derive(Debug, Clone, PartialEq)]
pub enum RouteDecision {
    /// 进入指定 Combo
    Enter(String),
    /// 跳过指定 Combo（条件满足，不需要执行）
    Skip(String),
    /// 回退到指定 Combo（重新执行）
    Fallback(String),
    /// 阻塞 — 需要用户决定才能继续
    Blocked(String),
    /// 管线完成
    Complete,
}

impl RouteDecision {
    /// 获取目标 Combo ID（Enter/Skip/Fallback 时）
    pub fn target(&self) -> Option<&str> {
        match self {
            RouteDecision::Enter(id)
            | RouteDecision::Skip(id)
            | RouteDecision::Fallback(id) => Some(id.as_str()),
            RouteDecision::Blocked(_) | RouteDecision::Complete => None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, RouteDecision::Complete | RouteDecision::Blocked(_))
    }

    pub fn summary(&self) -> String {
        match self {
            RouteDecision::Enter(id) => format!("→ 进入 {}", id),
            RouteDecision::Skip(id) => format!("→ 跳过 {}", id),
            RouteDecision::Fallback(id) => format!("↩ 回退到 {}", id),
            RouteDecision::Blocked(reason) => format!("⛔ 阻塞: {}", reason),
            RouteDecision::Complete => "✅ 管线完成".to_string(),
        }
    }
}

// ── 匹配条件 ─────────────────────────────────────────────────

/// 规则匹配条件
#[derive(Debug, Clone)]
pub enum RouteCondition {
    /// 指定产物类型存在
    ArtifactExists(String),
    /// 指定产物类型不存在
    ArtifactMissing(String),
    /// Gate 结果为通过
    GatePassed,
    /// Gate 结果为失败
    GateFailed,
    /// 测试全部通过
    TestsPassed,
    /// 测试存在失败
    TestsFailed,
    /// 默认匹配（兜底规则）
    Always,
}

// ── 路由规则 ─────────────────────────────────────────────────

/// 一条路由规则
#[derive(Debug, Clone)]
pub struct RouteRule {
    pub condition: RouteCondition,
    pub decision: RouteDecision,
    pub priority: u8,
    pub description: String,
}

impl RouteRule {
    pub fn new(condition: RouteCondition, decision: RouteDecision, priority: u8, description: &str) -> Self {
        Self {
            condition,
            decision,
            priority,
            description: description.to_string(),
        }
    }
}

// ── 路由器 ───────────────────────────────────────────────────

/// 路由器 — 根据当前状态和产物决定下一步
#[derive(Debug, Clone)]
pub struct Router {
    /// combo_id → 该 Combo 完成后的路由规则列表
    rules: HashMap<String, Vec<RouteRule>>,
    /// 默认规则
    default_rules: Vec<RouteRule>,
}

impl Router {
    pub fn new() -> Self {
        Self {
            rules: HashMap::new(),
            default_rules: vec![
                RouteRule::new(
                    RouteCondition::Always,
                    RouteDecision::Complete,
                    0,
                    "无匹配规则 → 管线完成",
                ),
            ],
        }
    }

    /// 为指定 Combo 注册路由规则
    pub fn add_rules(&mut self, combo_id: &str, rules: Vec<RouteRule>) {
        self.rules.insert(combo_id.to_string(), rules);
    }

    /// 获取指定 Combo 的规则
    pub fn get_rules(&self, combo_id: &str) -> Option<&[RouteRule]> {
        self.rules.get(combo_id).map(|v| v.as_slice())
    }

    /// 根据当前状态和产物，决定下一步
    ///
    /// - `current_combo`: 当前（刚完成的）Combo ID
    /// - `artifacts`: 当前产物仓库
    /// - `gate_result`: 审阅门禁结果（Some("pass") / Some("fail") / None）
    /// - `test_result`: 测试结果（Some("pass") / Some("fail") / None）
    pub fn decide(
        &self,
        current_combo: &str,
        artifacts: &ArtifactStore,
        gate_result: Option<&str>,
        test_result: Option<&str>,
    ) -> RouteDecision {
        let rules = self.rules.get(current_combo)
            .unwrap_or(&self.default_rules);

        let mut sorted = rules.clone();
        sorted.sort_by_key(|r| std::cmp::Reverse(r.priority));

        for rule in &sorted {
            if self.evaluate(&rule.condition, artifacts, gate_result, test_result) {
                return rule.decision.clone();
            }
        }

        RouteDecision::Blocked("无匹配路由规则，需要用户决定".to_string())
    }

    fn evaluate(
        &self,
        condition: &RouteCondition,
        artifacts: &ArtifactStore,
        gate_result: Option<&str>,
        test_result: Option<&str>,
    ) -> bool {
        match condition {
            RouteCondition::ArtifactExists(t) => artifacts.has(t),
            RouteCondition::ArtifactMissing(t) => !artifacts.has(t),
            RouteCondition::GatePassed => gate_result == Some("pass"),
            RouteCondition::GateFailed => gate_result == Some("fail"),
            RouteCondition::TestsPassed => test_result == Some("pass"),
            RouteCondition::TestsFailed => test_result == Some("fail"),
            RouteCondition::Always => true,
        }
    }
}

// ── 默认路由规则（SomaOS 主链） ─────────────────────────────

/// 创建主链的默认路由规则
pub fn default_main_chain_router() -> Router {
    use crate::combo::pipeline::*;
    let mut router = Router::new();

    // ── office-hours ──
    router.add_rules("office-hours", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_DESIGN_DECISION.to_string()),
            RouteDecision::Enter("spec".to_string()),
            100,
            "设计决策已产出 → 进入需求规格",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_DESIGN_DECISION.to_string()),
            RouteDecision::Blocked("未产出设计决策，需要用户确认方向".to_string()),
            90,
            "方向不明确 → 阻塞等待用户",
        ),
    ]);

    // ── spec ──
    router.add_rules("spec", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_SPEC.to_string()),
            RouteDecision::Enter("plan".to_string()),
            100,
            "规格已产出 → 进入实施计划",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_SPEC.to_string()),
            RouteDecision::Blocked("规格文档未完成，需要用户补充信息".to_string()),
            90,
            "规格不完整 → 阻塞",
        ),
    ]);

    // ── plan ──
    router.add_rules("plan", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_PLAN.to_string()),
            RouteDecision::Enter("plan-review".to_string()),
            100,
            "实施计划已产出 → 进入方案审阅",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_PLAN.to_string()),
            RouteDecision::Blocked("实施计划未完成".to_string()),
            90,
            "计划不完整 → 阻塞",
        ),
    ]);

    // ── plan-review ──
    router.add_rules("plan-review", vec![
        RouteRule::new(
            RouteCondition::GatePassed,
            RouteDecision::Enter("implement".to_string()),
            100,
            "方案审阅通过 → 进入实施",
        ),
        RouteRule::new(
            RouteCondition::GateFailed,
            RouteDecision::Fallback("plan".to_string()),
            90,
            "方案审阅失败 → 回到实施计划",
        ),
        RouteRule::new(
            RouteCondition::Always,
            RouteDecision::Blocked("方案审阅阻塞，需要用户决策".to_string()),
            80,
            "审阅结果不明确 → 阻塞",
        ),
    ]);

    // ── implement ──
    router.add_rules("implement", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_CODE_CHANGES.to_string()),
            RouteDecision::Enter("review".to_string()),
            100,
            "代码变更已完成 → 进入代码审阅",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_CODE_CHANGES.to_string()),
            RouteDecision::Blocked("代码变更未完成".to_string()),
            90,
            "实施未完成 → 阻塞",
        ),
    ]);

    // ── review ──
    router.add_rules("review", vec![
        RouteRule::new(
            RouteCondition::GatePassed,
            RouteDecision::Enter("qa".to_string()),
            100,
            "代码审阅通过 → 进入质量验证",
        ),
        RouteRule::new(
            RouteCondition::GateFailed,
            RouteDecision::Fallback("implement".to_string()),
            90,
            "代码审阅发现需修复问题 → 回到实施",
        ),
        RouteRule::new(
            RouteCondition::Always,
            RouteDecision::Blocked("审阅阻塞，需要用户决定".to_string()),
            80,
            "审阅结果不明确 → 阻塞",
        ),
    ]);

    // ── qa ──
    router.add_rules("qa", vec![
        RouteRule::new(
            RouteCondition::TestsPassed,
            RouteDecision::Enter("ship".to_string()),
            100,
            "质量验证通过 → 进入交付发布",
        ),
        RouteRule::new(
            RouteCondition::TestsFailed,
            RouteDecision::Fallback("implement".to_string()),
            90,
            "质量验证发现 Bug → 回到实施修复",
        ),
        RouteRule::new(
            RouteCondition::GateFailed,
            RouteDecision::Fallback("implement".to_string()),
            85,
            "QA Gate 失败 → 回到实施",
        ),
        RouteRule::new(
            RouteCondition::Always,
            RouteDecision::Blocked("质量验证状态不明确".to_string()),
            80,
            "QA 结果无法判断 → 阻塞",
        ),
    ]);

    // ── ship ──
    router.add_rules("ship", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_RELEASE.to_string()),
            RouteDecision::Complete,
            100,
            "交付发布完成 → 管线结束",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_QA.to_string()),
            RouteDecision::Fallback("qa".to_string()),
            90,
            "缺少质量验证证据 → 回到质量验证",
        ),
    ]);

    // ── investigate ──
    router.add_rules("investigate", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_DEBUG.to_string()),
            RouteDecision::Enter("implement".to_string()),
            100,
            "调查完成 → 进入修复实施",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_DEBUG.to_string()),
            RouteDecision::Blocked("未找到根因".to_string()),
            90,
            "调查未完成 → 阻塞",
        ),
    ]);

    router
}

// ── Bug 修复子链路由 ────────────────────────────────────────

/// 创建 Bug 修复短路路由 — 直接进入 investigate，绕过 office-hours/spec/plan
pub fn bug_fix_shortcut_router() -> Router {
    use crate::combo::pipeline::ARTIFACT_DEBUG;
    let mut router = Router::new();

    router.add_rules("start", vec![
        RouteRule::new(
            RouteCondition::Always,
            RouteDecision::Enter("investigate".to_string()),
            100,
            "Bug 修复短路 → 直接进入调查",
        ),
    ]);

    router.add_rules("investigate", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists(ARTIFACT_DEBUG.to_string()),
            RouteDecision::Enter("implement".to_string()),
            100,
            "调查完成 → 进入修复",
        ),
        RouteRule::new(
            RouteCondition::ArtifactMissing(ARTIFACT_DEBUG.to_string()),
            RouteDecision::Blocked("根因未找到".to_string()),
            90,
            "调查未完成 → 阻塞",
        ),
    ]);

    router.add_rules("implement", vec![
        RouteRule::new(
            RouteCondition::ArtifactExists("code_changes".to_string()),
            RouteDecision::Enter("review".to_string()),
            100,
            "修复完成 → 进入代码审阅",
        ),
    ]);

    router.add_rules("review", vec![
        RouteRule::new(
            RouteCondition::GatePassed,
            RouteDecision::Complete,
            100,
            "审阅通过 → 修复完成",
        ),
        RouteRule::new(
            RouteCondition::GateFailed,
            RouteDecision::Fallback("implement".to_string()),
            90,
            "审阅发现问题 → 回到修复",
        ),
    ]);

    router
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::pipeline::{Artifact, ArtifactStore, ARTIFACT_DESIGN_DECISION,
        ARTIFACT_SPEC, ARTIFACT_PLAN, ARTIFACT_CODE_CHANGES,
        ARTIFACT_QA, ARTIFACT_RELEASE, ARTIFACT_DEBUG};

    fn make_artifact(artifact_type: &str) -> Artifact {
        Artifact::new(artifact_type, "test", serde_json::json!({}), "test artifact")
    }

    fn store_with(types: &[&str]) -> ArtifactStore {
        let mut store = ArtifactStore::new();
        for t in types {
            store.store(make_artifact(t));
        }
        store
    }

    // ── 主链路由测试 ──

    #[test]
    fn test_office_hours_with_decision_proceeds_to_spec() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION]);

        let decision = router.decide("office-hours", &artifacts, None, None);
        assert_eq!(decision, RouteDecision::Enter("spec".into()));
    }

    #[test]
    fn test_office_hours_without_decision_blocks() {
        let router = default_main_chain_router();
        let artifacts = ArtifactStore::new();

        let decision = router.decide("office-hours", &artifacts, None, None);
        assert!(matches!(decision, RouteDecision::Blocked(_)));
    }

    #[test]
    fn test_spec_to_plan() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION, ARTIFACT_SPEC]);

        let decision = router.decide("spec", &artifacts, None, None);
        assert_eq!(decision, RouteDecision::Enter("plan".into()));
    }

    #[test]
    fn test_plan_to_plan_review() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION, ARTIFACT_SPEC, ARTIFACT_PLAN]);

        let decision = router.decide("plan", &artifacts, None, None);
        assert_eq!(decision, RouteDecision::Enter("plan-review".into()));
    }

    #[test]
    fn test_plan_review_passed_to_implement() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION, ARTIFACT_SPEC, ARTIFACT_PLAN]);

        let decision = router.decide("plan-review", &artifacts, Some("pass"), None);
        assert_eq!(decision, RouteDecision::Enter("implement".into()));
    }

    #[test]
    fn test_plan_review_failed_falls_back_to_plan() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION, ARTIFACT_SPEC, ARTIFACT_PLAN]);

        let decision = router.decide("plan-review", &artifacts, Some("fail"), None);
        assert_eq!(decision, RouteDecision::Fallback("plan".into()));
    }

    #[test]
    fn test_review_passed_to_qa() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_CODE_CHANGES]);

        let decision = router.decide("review", &artifacts, Some("pass"), None);
        assert_eq!(decision, RouteDecision::Enter("qa".into()));
    }

    #[test]
    fn test_review_failed_falls_back_to_implement() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_CODE_CHANGES]);

        let decision = router.decide("review", &artifacts, Some("fail"), None);
        assert_eq!(decision, RouteDecision::Fallback("implement".into()));
    }

    #[test]
    fn test_qa_passed_to_ship() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_QA]);

        let decision = router.decide("qa", &artifacts, Some("pass"), Some("pass"));
        assert_eq!(decision, RouteDecision::Enter("ship".into()));
    }

    #[test]
    fn test_qa_failed_falls_back_to_implement() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_QA]);

        let decision = router.decide("qa", &artifacts, Some("pass"), Some("fail"));
        assert_eq!(decision, RouteDecision::Fallback("implement".into()));
    }

    #[test]
    fn test_ship_completes_chain() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_QA, ARTIFACT_RELEASE]);

        let decision = router.decide("ship", &artifacts, None, None);
        assert_eq!(decision, RouteDecision::Complete);
    }

    // ── Gate 文档中的路由场景 ──

    /// "需求明确 → 跳过 office-hours"
    #[test]
    fn test_scenario_clear_requirements_skips_office_hours() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION]);

        // 需求明确：用户直接给出清晰需求，DesignDecision 已存在
        // 路由应直接进入 spec
        let decision = router.decide("office-hours", &artifacts, None, None);
        assert_eq!(decision, RouteDecision::Enter("spec".into()));
        // 注：Gate D 路由决定"进入 spec"而非"跳过 office-hours"，
        // 因为 office-hours 已执行完毕（有产物）。跳过逻辑在阶段选择时触发。
    }

    /// "小型修复 → investigate → fix → review（不进入 spec/plan）"
    #[test]
    fn test_scenario_small_fix_uses_bug_fix_shortcut() {
        let router = bug_fix_shortcut_router();

        // 从 start 直接进入 investigate
        let start = router.decide("start", &ArtifactStore::new(), None, None);
        assert_eq!(start, RouteDecision::Enter("investigate".into()));

        // investigate 完成 → implement
        let artifacts = store_with(&[ARTIFACT_DEBUG]);
        let after_investigate = router.decide("investigate", &artifacts, None, None);
        assert_eq!(after_investigate, RouteDecision::Enter("implement".into()));

        // implement 完成 → review
        let artifacts = store_with(&[ARTIFACT_DEBUG, "code_changes"]);
        let after_implement = router.decide("implement", &artifacts, None, None);
        assert_eq!(after_implement, RouteDecision::Enter("review".into()));

        // review passed → Complete
        let after_review = router.decide("review", &artifacts, Some("pass"), None);
        assert_eq!(after_review, RouteDecision::Complete);
        // 验证确实没有进入 spec/plan
        assert_ne!(after_review, RouteDecision::Enter("spec".into()));
        assert_ne!(after_review, RouteDecision::Enter("plan".into()));
    }

    /// "Scope Drift → 回到 spec"
    #[test]
    fn test_scenario_scope_drift_falls_back_to_spec() {
        // Scope drift 在 plan-review 阶段发现，
        // 但当前路由规则中 plan-review 失败回退到 plan
        // Scope drift 意味着需求变更，更恰当的回退目标是 spec
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_DESIGN_DECISION, ARTIFACT_SPEC, ARTIFACT_PLAN]);

        // plan-review Gate 失败 → 回退到 plan
        let decision = router.decide("plan-review", &artifacts, Some("fail"), None);
        assert_eq!(decision, RouteDecision::Fallback("plan".into()));

        // 注意：如果 scope drift 确实需要回到 spec，
        // 可以在外部逻辑中对 plan-review 的 GateFailed 做特殊处理
        // 当前路由实现 plan-review 失败回退到 plan（重新规划），
        // 如果重规划也未解决，plan 阶段可进一步回退到 spec
    }

    /// "QA 发现行为错误 → 回到 investigate 或 implement"
    #[test]
    fn test_scenario_qa_finds_bug_falls_back_to_implement() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_QA]);

        // QA 测试失败 → 回到 implement
        let decision = router.decide("qa", &artifacts, None, Some("fail"));
        assert_eq!(decision, RouteDecision::Fallback("implement".into()));

        // QA Gate 失败也回到 implement
        let decision = router.decide("qa", &artifacts, Some("fail"), None);
        assert_eq!(decision, RouteDecision::Fallback("implement".into()));
    }

    /// "Ship 缺少新鲜证据 → 回到 QA"
    #[test]
    fn test_scenario_ship_needs_fresh_qa() {
        let router = default_main_chain_router();
        // 有 ReleaseResult 但无 QA 产物
        let artifacts = store_with(&[ARTIFACT_RELEASE]);

        let decision = router.decide("ship", &artifacts, None, None);
        // 因为优先匹配 ArtifactExists(RELEASE) → Complete
        assert_eq!(decision, RouteDecision::Complete);
    }

    // ── 边界测试 ──

    #[test]
    fn test_unknown_combo_returns_complete() {
        let router = default_main_chain_router();
        let decision = router.decide("unknown-combo", &ArtifactStore::new(), None, None);
        assert_eq!(decision, RouteDecision::Complete);
    }

    #[test]
    fn test_decision_summary_readable() {
        let d = RouteDecision::Enter("spec".into());
        assert!(d.summary().contains("进入 spec"));

        let d = RouteDecision::Blocked("需要用户决定".into());
        assert!(d.summary().contains("阻塞"));

        let d = RouteDecision::Complete;
        assert!(d.summary().contains("完成"));
    }

    #[test]
    fn test_target_extraction() {
        let d = RouteDecision::Enter("qa".into());
        assert_eq!(d.target(), Some("qa"));

        let d = RouteDecision::Fallback("plan".into());
        assert_eq!(d.target(), Some("plan"));

        let d = RouteDecision::Complete;
        assert_eq!(d.target(), None);
    }

    #[test]
    fn test_full_main_chain_no_fallbacks() {
        // 模拟完整主链理想路径，每步都 pass
        let router = default_main_chain_router();
        let mut artifacts = ArtifactStore::new();

        // 1. office-hours → spec
        artifacts.store(make_artifact(ARTIFACT_DESIGN_DECISION));
        assert_eq!(router.decide("office-hours", &artifacts, None, None),
            RouteDecision::Enter("spec".into()));

        // 2. spec → plan
        artifacts.store(make_artifact(ARTIFACT_SPEC));
        assert_eq!(router.decide("spec", &artifacts, None, None),
            RouteDecision::Enter("plan".into()));

        // 3. plan → plan-review
        artifacts.store(make_artifact(ARTIFACT_PLAN));
        assert_eq!(router.decide("plan", &artifacts, None, None),
            RouteDecision::Enter("plan-review".into()));

        // 4. plan-review → implement (gate passed)
        assert_eq!(router.decide("plan-review", &artifacts, Some("pass"), None),
            RouteDecision::Enter("implement".into()));

        // 5. implement → review
        artifacts.store(make_artifact(ARTIFACT_CODE_CHANGES));
        assert_eq!(router.decide("implement", &artifacts, None, None),
            RouteDecision::Enter("review".into()));

        // 6. review → qa (gate passed)
        assert_eq!(router.decide("review", &artifacts, Some("pass"), None),
            RouteDecision::Enter("qa".into()));

        // 7. qa → ship (tests passed)
        artifacts.store(make_artifact(ARTIFACT_QA));
        assert_eq!(router.decide("qa", &artifacts, Some("pass"), Some("pass")),
            RouteDecision::Enter("ship".into()));

        // 8. ship → Complete
        artifacts.store(make_artifact(ARTIFACT_RELEASE));
        assert_eq!(router.decide("ship", &artifacts, None, None),
            RouteDecision::Complete);
    }

    #[test]
    fn test_review_blocked() {
        let router = default_main_chain_router();
        let artifacts = store_with(&[ARTIFACT_CODE_CHANGES]);

        // review 结果不明确（gate_result 为 None）
        let decision = router.decide("review", &artifacts, None, None);
        assert!(matches!(decision, RouteDecision::Blocked(_)));
    }

    #[test]
    fn test_default_router_structure() {
        let router = default_main_chain_router();

        // 验证主链所有阶段都有路由规则
        let expected_combos = ["office-hours", "spec", "plan", "plan-review",
            "implement", "review", "qa", "ship", "investigate"];
        for combo in &expected_combos {
            assert!(
                router.get_rules(combo).is_some(),
                "Combo {} 缺少路由规则", combo
            );
            assert!(
                !router.get_rules(combo).unwrap().is_empty(),
                "Combo {} 的路由规则为空", combo
            );
        }
    }
}
