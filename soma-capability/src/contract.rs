use serde::{Deserialize, Serialize};

// ── Effect Classification ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EffectClass {
    ReadOnly,
    WriteLocal,
    WriteGlobal,
    SideEffect,
}

// ── Reversibility ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Reversibility {
    Reversible,
    Irreversible,
    ConditionalReversibility,
}

// ── Capability Contract V1 (GATE-SOMA-NATIVE-001) ──

/// 能力作用域：定义 Capability 能够操作的范围
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetScope {
    /// 允许的文件路径模式（glob），如 ["src/**", "tests/**"]
    pub allowed_paths: Vec<String>,
    /// 拒绝的文件路径模式，如 ["**/.env", "**/*.key"]
    pub denied_paths: Vec<String>,
    /// 允许的命令模板（process 类 Capability 使用）
    pub allowed_commands: Vec<String>,
}

impl Default for TargetScope {
    fn default() -> Self {
        Self {
            allowed_paths: vec!["**".to_string()],
            denied_paths: vec![],
            allowed_commands: vec![],
        }
    }
}

/// 前置条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Precondition {
    pub description: String,
    /// 前置条件类型标识，用于 Policy Engine 匹配
    pub precondition_type: String,
}

/// 资源预算
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBudget {
    pub max_invocations: Option<u32>,
    pub max_total_time_seconds: Option<u32>,
    pub max_data_volume_bytes: Option<u64>,
}

impl Default for CostBudget {
    fn default() -> Self {
        Self {
            max_invocations: None,
            max_total_time_seconds: None,
            max_data_volume_bytes: None,
        }
    }
}

/// Readback 策略
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ReadbackStrategy {
    /// 不需要回读验证（只读能力）
    None,
    /// 写入前后比较文件 hash
    HashCompare,
    /// 写入前后比较完整内容
    ContentCompare,
}

/// Capability 契约 V1
///
/// Model Tool Schema 只是给模型看的投影。
/// Capability Contract 才是 Soma 执行和治理的正式契约。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityContract {
    pub capability_id: String,
    pub contract_version: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub effect_class: EffectClass,
    pub reversibility: Reversibility,

    // ── GATE-SOMA-NATIVE-001 新增字段 ──
    pub target_scope: TargetScope,
    pub preconditions: Vec<Precondition>,
    pub cost_budget: CostBudget,
    pub expected_observation: String,
    pub evidence_output: String,
    pub readback_strategy: ReadbackStrategy,
}

impl CapabilityContract {
    /// 快速创建契约（Gate V1 默认值）
    pub fn basic(
        capability_id: &str,
        description: &str,
        effect_class: EffectClass,
        input_schema: serde_json::Value,
    ) -> Self {
        Self {
            capability_id: capability_id.to_string(),
            contract_version: "1.0.0".to_string(),
            description: description.to_string(),
            input_schema,
            output_schema: serde_json::json!({}),
            effect_class,
            reversibility: Reversibility::Reversible,
            target_scope: TargetScope::default(),
            preconditions: vec![],
            cost_budget: CostBudget::default(),
            expected_observation: "observation".to_string(),
            evidence_output: "Observation".to_string(),
            readback_strategy: ReadbackStrategy::None,
        }
    }
}
