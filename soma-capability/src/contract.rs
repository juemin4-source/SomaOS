use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EffectClass {
    ReadOnly,
    WriteLocal,
    WriteGlobal,
    SideEffect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Reversibility {
    Reversible,
    Irreversible,
    ConditionalReversibility,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityContract {
    pub capability_id: String,
    pub input_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub effect_class: EffectClass,
    pub reversibility: Reversibility,
}
