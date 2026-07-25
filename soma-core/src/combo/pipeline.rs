/// SomaOS 产品管线 — 跨 Combo 产物传递
///
/// Gate C：定义产物类型和主链管线。
/// 每个 Combo 产生结构化产物，下一阶段的 Combo 自动读取上一阶段产物。
///
/// 主链：
///   office-hours → spec → plan → plan-review → implement → review → qa → ship
///
/// 条件分支：
///   investigate（发现 Bug 时插入）
///   project-takeover（进入新项目时入口）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── 产物类型标识（字符串常量） ──────────────────────────────────

/// 产品方向决策
pub const ARTIFACT_DESIGN_DECISION: &str = "design_decision";
/// 规格文档
pub const ARTIFACT_SPEC: &str = "spec_document";
/// 实施计划
pub const ARTIFACT_PLAN: &str = "implementation_plan";
/// 方案审阅报告
pub const ARTIFACT_PLAN_REVIEW: &str = "plan_review_report";
/// 代码变更
pub const ARTIFACT_CODE_CHANGES: &str = "code_changes";
/// 代码审阅报告
pub const ARTIFACT_REVIEW: &str = "review_report";
/// 质量验证报告
pub const ARTIFACT_QA: &str = "qa_report";
/// 交付发布结果
pub const ARTIFACT_RELEASE: &str = "release_result";
/// 调查调试报告
pub const ARTIFACT_DEBUG: &str = "debug_report";
/// 项目接管报告
pub const ARTIFACT_TAKEOVER: &str = "takeover_report";

// ── 产物 ───────────────────────────────────────────────────────

/// 一个管线产物 — 由某个 Combo 产生，可被后续 Combo 消费
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    /// 产物类型标识（对应 ARTIFACT_* 常量）
    pub artifact_type: String,
    /// 产生该产物的 Combo ID
    pub producer: String,
    /// 产物内容（JSON Value，各 Combo 自行解释）
    pub content: serde_json::Value,
    /// 产物摘要（用于快速预览）
    pub summary: String,
    /// 版本号（同一 Combo 多次运行递增）
    pub version: u32,
    /// 时间戳
    pub created_at: String,
}

impl Artifact {
    pub fn new(
        artifact_type: &str,
        producer: &str,
        content: serde_json::Value,
        summary: &str,
    ) -> Self {
        Self {
            artifact_type: artifact_type.to_string(),
            producer: producer.to_string(),
            content,
            summary: summary.to_string(),
            version: 1,
            created_at: chrono_or_fallback(),
        }
    }
}

// ── 管线阶段 ──────────────────────────────────────────────────

/// 管线中的一个阶段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStage {
    /// 使用的 Combo ID
    pub combo_id: String,
    /// 该阶段需要消耗的产物类型列表
    pub consumes: Vec<String>,
    /// 该阶段产生的产物类型
    pub produces: String,
    /// 显示名称
    pub display_name: String,
    /// 是否可跳过（用户已清楚目标时）
    pub skippable: bool,
}

impl PipelineStage {
    pub fn new(combo_id: &str, consumes: Vec<String>, produces: &str, display_name: &str, skippable: bool) -> Self {
        Self {
            combo_id: combo_id.to_string(),
            consumes,
            produces: produces.to_string(),
            display_name: display_name.to_string(),
            skippable,
        }
    }
}

// ── 管线 ──────────────────────────────────────────────────────

/// 完整产品管线 — 有序的阶段集合
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pipeline {
    pub stages: Vec<PipelineStage>,
    pub description: String,
}

impl Pipeline {
    pub fn new(description: &str) -> Self {
        Self {
            stages: Vec::new(),
            description: description.to_string(),
        }
    }

    /// 添加一个阶段
    pub fn add_stage(&mut self, stage: PipelineStage) {
        self.stages.push(stage);
    }

    /// 获取所有阶段
    pub fn stages(&self) -> &[PipelineStage] {
        &self.stages
    }

    /// 按 combo_id 查找阶段
    pub fn find_stage(&self, combo_id: &str) -> Option<&PipelineStage> {
        self.stages.iter().find(|s| s.combo_id == combo_id)
    }

    /// 获取某个阶段的前一个阶段
    pub fn previous_stage(&self, combo_id: &str) -> Option<&PipelineStage> {
        let pos = self.stages.iter().position(|s| s.combo_id == combo_id)?;
        if pos == 0 { None } else { Some(&self.stages[pos - 1]) }
    }

    /// 获取某个阶段的后一个阶段
    pub fn next_stage(&self, combo_id: &str) -> Option<&PipelineStage> {
        let pos = self.stages.iter().position(|s| s.combo_id == combo_id)?;
        self.stages.get(pos + 1)
    }
}

// ── 默认主链 ──────────────────────────────────────────────────

/// SomaOS 完整研发主链
///
/// 从模糊需求到交付发布，8 个 Combo 构成完整链路。
pub fn main_product_chain() -> Pipeline {
    let mut pipeline = Pipeline::new("SomaOS 完整研发主链：从模糊需求到交付发布");

    pipeline.add_stage(PipelineStage::new(
        "office-hours", vec![],
        ARTIFACT_DESIGN_DECISION, "产品方向诊断",
        true,  // 需求明确时可跳过
    ));

    pipeline.add_stage(PipelineStage::new(
        "spec", vec![ARTIFACT_DESIGN_DECISION.into()],
        ARTIFACT_SPEC, "需求规格",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "plan", vec![ARTIFACT_SPEC.into()],
        ARTIFACT_PLAN, "实施计划",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "plan-review", vec![ARTIFACT_PLAN.into()],
        ARTIFACT_PLAN_REVIEW, "方案审阅",
        false,
    ));

    // implement 没有独立 Combo，由 Softills + Organs 执行
    pipeline.add_stage(PipelineStage::new(
        "implement", vec![ARTIFACT_PLAN_REVIEW.into()],
        ARTIFACT_CODE_CHANGES, "实施（代码变更）",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "review", vec![ARTIFACT_CODE_CHANGES.into()],
        ARTIFACT_REVIEW, "代码审阅",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "qa", vec![ARTIFACT_REVIEW.into()],
        ARTIFACT_QA, "质量验证",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "ship", vec![ARTIFACT_QA.into()],
        ARTIFACT_RELEASE, "交付发布",
        false,
    ));

    pipeline
}

/// Bug 修复子链：调查 → 修复 → 审阅
pub fn bug_fix_chain() -> Pipeline {
    let mut pipeline = Pipeline::new("Bug 修复子链：调查根因 → 修复 → 代码审阅");

    pipeline.add_stage(PipelineStage::new(
        "investigate", vec![],
        ARTIFACT_DEBUG, "Bug 调查",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "implement", vec![ARTIFACT_DEBUG.into()],
        ARTIFACT_CODE_CHANGES, "修复（代码变更）",
        false,
    ));

    pipeline.add_stage(PipelineStage::new(
        "review", vec![ARTIFACT_CODE_CHANGES.into()],
        ARTIFACT_REVIEW, "代码审阅",
        false,
    ));

    pipeline
}

// ── 产物传递 helper ──────────────────────────────────────────

/// 产物仓库 — 管理管线中产生的所有产物
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactStore {
    /// artifact_type → Artifact
    artifacts: HashMap<String, Artifact>,
    /// 产生顺序（用于回溯）
    history: Vec<String>,
}

impl ArtifactStore {
    pub fn new() -> Self {
        Self {
            artifacts: HashMap::new(),
            history: Vec::new(),
        }
    }

    /// 存储一个产物（按类型覆盖，版本递增）
    pub fn store(&mut self, artifact: Artifact) {
        let key = artifact.artifact_type.clone();

        // 如果已存在，版本递增
        if let Some(existing) = self.artifacts.get(&key) {
            let mut updated = artifact;
            updated.version = existing.version + 1;
            self.artifacts.insert(key.clone(), updated);
        } else {
            self.artifacts.insert(key.clone(), artifact);
        }

        self.history.push(key);
    }

    /// 获取指定类型的产物
    pub fn get(&self, artifact_type: &str) -> Option<&Artifact> {
        self.artifacts.get(artifact_type)
    }

    /// 列出所有已存储的产物类型
    pub fn list_types(&self) -> Vec<&str> {
        self.artifacts.keys().map(|s| s.as_str()).collect()
    }

    /// 检查指定产物是否存在
    pub fn has(&self, artifact_type: &str) -> bool {
        self.artifacts.contains_key(artifact_type)
    }

    /// 获取历史记录（按产生顺序）
    pub fn history(&self) -> &[String] {
        &self.history
    }

    /// 清空指定类型之后的所有产物（回退用）
    pub fn truncate_after(&mut self, artifact_type: &str) {
        let pos = self.history.iter().position(|t| t == artifact_type);
        if let Some(idx) = pos {
            // 移除该类型之后产生的所有产物
            for t in self.history.drain(idx + 1..) {
                self.artifacts.remove(&t);
            }
        }
    }
}

// ── 时间戳（无 chrono 依赖时的降级） ────────────────────────

fn chrono_or_fallback() -> String {
    // 尝试用 std::time 生成时间戳
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    // 格式化为 ISO-like 时间戳
    let days = secs / 86400;
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        1970 + (days / 365) as u32,
        ((days % 365) / 30 + 1) as u32,
        (days % 30 + 1) as u32,
        h, m, s)
}

// ── Combo 产物映射 ──────────────────────────────────────────

/// 返回 Combo ID → 它产生的产物类型
pub fn combo_produces() -> Vec<(&'static str, &'static str)> {
    vec![
        ("office-hours", ARTIFACT_DESIGN_DECISION),
        ("spec", ARTIFACT_SPEC),
        ("plan", ARTIFACT_PLAN),
        ("plan-review", ARTIFACT_PLAN_REVIEW),
        ("review", ARTIFACT_REVIEW),
        ("qa", ARTIFACT_QA),
        ("ship", ARTIFACT_RELEASE),
        ("investigate", ARTIFACT_DEBUG),
        ("project-takeover", ARTIFACT_TAKEOVER),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_main_chain_has_8_stages() {
        let chain = main_product_chain();
        assert_eq!(chain.stages.len(), 8);
    }

    #[test]
    fn test_main_chain_order() {
        let chain = main_product_chain();
        assert_eq!(chain.stages[0].combo_id, "office-hours");
        assert_eq!(chain.stages[1].combo_id, "spec");
        assert_eq!(chain.stages[2].combo_id, "plan");
        assert_eq!(chain.stages[3].combo_id, "plan-review");
        assert_eq!(chain.stages[4].combo_id, "implement");
        assert_eq!(chain.stages[5].combo_id, "review");
        assert_eq!(chain.stages[6].combo_id, "qa");
        assert_eq!(chain.stages[7].combo_id, "ship");
    }

    #[test]
    fn test_bug_fix_chain_has_3_stages() {
        let chain = bug_fix_chain();
        assert_eq!(chain.stages.len(), 3);
    }

    #[test]
    fn test_artifact_store_roundtrip() {
        let mut store = ArtifactStore::new();
        let artifact = Artifact::new(
            ARTIFACT_SPEC,
            "spec",
            serde_json::json!({"title": "Test Spec"}),
            "A test specification",
        );
        store.store(artifact);

        let retrieved = store.get(ARTIFACT_SPEC);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().producer, "spec");
        assert_eq!(retrieved.unwrap().summary, "A test specification");
    }

    #[test]
    fn test_artifact_version_increment() {
        let mut store = ArtifactStore::new();

        let v1 = Artifact::new(
            ARTIFACT_SPEC, "spec",
            serde_json::json!({"title": "v1"}),
            "first version",
        );
        store.store(v1);
        assert_eq!(store.get(ARTIFACT_SPEC).unwrap().version, 1);

        let v2 = Artifact::new(
            ARTIFACT_SPEC, "spec",
            serde_json::json!({"title": "v2"}),
            "second version",
        );
        store.store(v2);
        assert_eq!(store.get(ARTIFACT_SPEC).unwrap().version, 2);
    }

    #[test]
    fn test_artifact_store_history() {
        let mut store = ArtifactStore::new();

        store.store(Artifact::new(ARTIFACT_DESIGN_DECISION, "office-hours",
            serde_json::json!({}), "decision"));
        store.store(Artifact::new(ARTIFACT_SPEC, "spec",
            serde_json::json!({}), "spec"));

        assert_eq!(store.history().len(), 2);
        assert_eq!(store.history()[0], ARTIFACT_DESIGN_DECISION);
        assert_eq!(store.history()[1], ARTIFACT_SPEC);
    }

    #[test]
    fn test_truncate_after() {
        let mut store = ArtifactStore::new();
        store.store(Artifact::new(ARTIFACT_DESIGN_DECISION, "office-hours",
            serde_json::json!({}), "a"));
        store.store(Artifact::new(ARTIFACT_SPEC, "spec",
            serde_json::json!({}), "b"));
        store.store(Artifact::new(ARTIFACT_PLAN, "plan",
            serde_json::json!({}), "c"));

        store.truncate_after(ARTIFACT_SPEC);
        assert!(store.get(ARTIFACT_DESIGN_DECISION).is_some());
        assert!(store.get(ARTIFACT_SPEC).is_some());
        assert!(store.get(ARTIFACT_PLAN).is_none());
    }

    #[test]
    fn test_stage_navigation() {
        let chain = main_product_chain();
        let prev = chain.previous_stage("plan");
        assert!(prev.is_some());
        assert_eq!(prev.unwrap().combo_id, "spec");

        let next = chain.next_stage("plan");
        assert!(next.is_some());
        assert_eq!(next.unwrap().combo_id, "plan-review");
    }

    #[test]
    fn test_first_stage_has_no_previous() {
        let chain = main_product_chain();
        assert!(chain.previous_stage("office-hours").is_none());
    }

    #[test]
    fn test_last_stage_has_no_next() {
        let chain = main_product_chain();
        assert!(chain.next_stage("ship").is_none());
    }

    #[test]
    fn test_combo_produces_list() {
        let mapping = combo_produces();
        assert_eq!(mapping.len(), 9);
        assert!(mapping.contains(&("review", ARTIFACT_REVIEW)));
        assert!(mapping.contains(&("ship", ARTIFACT_RELEASE)));
    }

    #[test]
    fn test_consumes_are_satisfied_by_prev_produces() {
        let chain = main_product_chain();
        for i in 1..chain.stages.len() {
            let stage = &chain.stages[i];
            let prev = &chain.stages[i - 1];
            for consumed in &stage.consumes {
                // 检查当前阶段消耗的产物是否等于前一阶段的产出
                // 或者前一阶段产出在后一阶段的消费列表中
                assert!(
                    consumed == &prev.produces
                        || prev.produces == "code_changes" && consumed == "code_changes",
                    "Stage {} consumes '{}' but stage {} produces '{}'",
                    stage.combo_id, consumed, prev.combo_id, prev.produces
                );
            }
        }
    }
}
