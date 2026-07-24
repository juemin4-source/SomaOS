use serde::{Deserialize, Serialize};

use crate::contract::CapabilityContract;

/// ActionRequest — 从模型 Tool Call 规范化后的治理请求
///
/// 模型发出的 Tool Call 必须先规范化为 ActionRequest，
/// 经过 Contract 匹配 + Policy 审核后才能到达 Organ。
///
/// 治理链路：
///   ToolCall → ActionRequest → ContractMatch → PolicyJudge → OrganExecute
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionRequest {
    /// 原始 tool call 名称（用于匹配 CapabilityContract）
    pub capability_id: String,
    /// 校验后的输入参数（匹配 input_schema 后）
    pub params: serde_json::Value,
    /// 匹配到的 CapabilityContract（Policy Judge 使用）
    pub contract: Option<CapabilityContract>,
    /// 请求来源（用于审计）
    pub source: ActionSource,
    /// 当前回合号
    pub turn_index: u32,
    /// 当前会话已用 Action 数
    pub action_index: u32,
}

/// 请求来源
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ActionSource {
    Model,
    User,
    System,
}
