use serde::{Deserialize, Serialize};

use super::skill::Skill;
use super::softill::Softill;

/// Combo — Skill + Softill + Organ 打出的完整连招
///
/// Combo 是完整的 AI 工作能力，能够解决某个领域中的一类真实问题或工作流程。
///
/// 0.8 原则：gstack 的 SKILL.md 就是 Combo 的执行体。
/// Combo 定义本身应保持薄——指向 gstack 源，而不是重新实现方法论。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Combo {
    /// 唯一标识
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 一句话说明
    pub description: String,
    /// 适用场景
    pub when_to_use: Vec<String>,

    // ── gstack 来源 ──
    /// gstack skill 的路径（如果来自 gstack）
    pub gstack_source: Option<String>,

    /// 需要加载的 Skill
    pub skills: Vec<Skill>,
    /// 可以使用的 Softill
    pub softills: Vec<Softill>,
    /// 依赖的 Organ 名称列表
    pub organ_dependencies: Vec<String>,
    /// 默认工作流程描述
    pub workflow: String,
    /// 完成标准
    pub completion_criteria: Vec<String>,
    /// 产物说明
    pub outputs: Vec<String>,
}

impl Combo {
    pub fn new(id: &str, name: &str, description: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            when_to_use: vec![],
            gstack_source: None,
            skills: vec![],
            softills: vec![],
            organ_dependencies: vec![],
            workflow: String::new(),
            completion_criteria: vec![],
            outputs: vec![],
        }
    }

    /// 标记此 Combo 来自 gstack 的某条 skill
    pub fn from_gstack(mut self, skill_name: &str) -> Self {
        self.gstack_source = Some(format!(".claude/skills/gstack/{}/SKILL.md", skill_name));
        self
    }
}
