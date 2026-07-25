use serde::{Deserialize, Serialize};

/// Skill — 方法论、流程、领域知识
///
/// Skill 主要改变 AI 的认知和做法，不负责连接软件或环境。
/// 可以包含：原则、步骤、检查清单、判断标准、经验模式、失败处理方式、产物要求。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    /// 唯一标识
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 一句话说明
    pub description: String,
    /// 适用场景描述
    pub when_to_use: String,
    /// Skill 内容（原则、步骤、方法等）
    pub body: String,
}

impl Skill {
    pub fn new(id: &str, name: &str, description: &str, when_to_use: &str, body: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            when_to_use: when_to_use.to_string(),
            body: body.to_string(),
        }
    }
}
