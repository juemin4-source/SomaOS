/// Figma 外部插件接入演示
///
/// 展示 REST API 如何作为 Softill 进入 SomaOS 能力体系。
/// Figma 官方 API: https://www.figma.com/developers/api
///
/// 不需要本地安装任何 Figma 插件。
/// 只需要一个 Figma 个人访问令牌，即可通过 REST API 读取设计数据。
///
/// Softill 适配器模式：HttpApi → Softill → Combo

use serde::{Deserialize, Serialize};

use super::combo::Combo;
use super::softill::{Softill, SoftillInvocation};
use super::skill::Skill;

// ── 产物类型 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FigmaFileInfo {
    pub file_key: String,
    pub file_name: String,
    pub last_modified: String,
    pub thumbnail_url: Option<String>,
    pub document: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FigmaStyles {
    pub file_key: String,
    pub styles: Vec<FigmaStyle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FigmaStyle {
    pub name: String,
    pub style_type: String,
    pub description: String,
}

// ── Figma File Read Softill ──

pub fn figma_file_read_softill() -> Softill {
    Softill {
        id: "figma-file-read".into(),
        name: "Figma File Reader".into(),
        description: "读取 Figma 设计文件的结构信息。通过 Figma REST API 获取文件节点树、图层、组件和样式。适用于设计资产分析、设计系统审计、设计与代码对照。".into(),
        invocation: SoftillInvocation::HttpApi {
            url_template: "https://api.figma.com/v1/files/{file_key}".into(),
            method: "GET".into(),
            headers: vec![
                ("X-Figma-Token".into(), "{auth_token}".into()),
            ],
            body_template: None,
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "file_key": {
                    "type": "string",
                    "description": "Figma 文件标识符（从 URL 中获取，如 abc123DEF）"
                },
                "auth_token": {
                    "type": "string",
                    "description": "Figma 个人访问令牌（设置 → 个人资料 → 生成令牌）"
                }
            },
            "required": ["file_key", "auth_token"]
        }),
        output_description: "Fig 文件信息：文件名、最后修改时间、缩略图URL、完整节点树（document）。".into(),
        effect: "network-read-only".into(),
    }
}

// ── Figma Style Export Softill ──

pub fn figma_style_export_softill() -> Softill {
    Softill {
        id: "figma-style-export".into(),
        name: "Figma Style Export".into(),
        description: "从 Figma 文件导出设计样式（颜色、文字、效果）。生成的样式数据可直接用于设计 Token 对照和前端代码生成。".into(),
        invocation: SoftillInvocation::HttpApi {
            url_template: "https://api.figma.com/v1/files/{file_key}/styles".into(),
            method: "GET".into(),
            headers: vec![
                ("X-Figma-Token".into(), "{auth_token}".into()),
            ],
            body_template: None,
        },
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "file_key": {
                    "type": "string",
                    "description": "Figma 文件标识符"
                },
                "auth_token": {
                    "type": "string",
                    "description": "Figma 个人访问令牌"
                }
            },
            "required": ["file_key", "auth_token"]
        }),
        output_description: "样式列表：每个样式包含 name, style_type（FILL/TEXT/EFFECT/GRID）, description。".into(),
        effect: "network-read-only".into(),
    }
}

// ── Design Sync Combo ──

pub fn design_sync_combo() -> Combo {
    let mut combo = Combo::new(
        "design-sync",
        "设计同步",
        "接入 Figma 等设计工具，将设计数据同步为结构化的资产信息。支持设计文件读取、样式导出、设计 Token 生成，供开发 Combo 消费。",
    );

    combo.when_to_use = vec![
        "读取 Figma 设计文件".into(),
        "导出设计 Token".into(),
        "设计系统审计".into(),
        "设计与代码对照".into(),
        "design sync".into(),
        "figma 接入".into(),
    ];

    combo.skills.push(Skill::new(
        "design-sync-methodology",
        "设计同步方法论",
        "如何将外部设计工具的资产接入 SomaOS：获取访问令牌、读取设计文件、提取样式、生成结构化资产。",
        "接入 Figma 或其他设计工具数据",
        r#"# 设计同步方法论

## 前置条件

1. Figma 个人访问令牌
   - 在 Figma 的 Settings → Account → Personal access tokens 生成
   - 令牌只需要只读权限（file:read, style:read）

2. Figma 文件 Key
   - 从 Figma 文件 URL 中获取: figma.com/file/ABC123DEF/name
   - 文件必须已授予令牌访问权限

## 工作流程

1. 读取文件结构
   - 获取完整节点树
   - 识别组件、Frame、图层
   - 提取设计系统信息

2. 导出设计 Token
   - 颜色（FILL 样式）
   - 文字排版
   - 效果（阴影、模糊）
   - 网格

3. 与代码对照
   - 比较设计 Token 与当前 CSS/Tailwind/样式变量
   - 标记差异
   - 生成更新建议
"#,
    ));

    // ── Figma API Softills ──
    // 外部 REST API → HttpApi 适配器 → SomaOS 能力

    combo.softills.push(figma_file_read_softill());
    combo.softills.push(figma_style_export_softill());

    combo.organ_dependencies = vec!["network".into()];

    combo.workflow = r#"设计同步流程

1. 获取 Figma 文件 Key 和访问令牌
2. 读取设计文件结构
3. 导出设计样式
4. 与现有设计 Token 对照
5. 输出差异报告或结构化的设计资产
"#.to_string();

    combo.completion_criteria = vec![
        "Figma 文件已读取".into(),
        "样式已导出".into(),
        "设计资产结构已输出".into(),
    ];

    combo.outputs = vec![
        "FigmaFileInfo（节点树、组件、图层）".into(),
        "FigmaStyles（颜色、文字、效果样式）".into(),
        "设计变更报告".into(),
    ];

    combo
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combo::registry::ComboRegistry;

    #[test]
    fn test_figma_file_read_softill_structure() {
        let s = figma_file_read_softill();
        assert_eq!(s.id, "figma-file-read");
        assert!(matches!(s.invocation, SoftillInvocation::HttpApi { .. }));
        assert!(!s.input_schema.as_object().unwrap().is_empty());
        assert!(s.input_schema["required"].as_array().unwrap().contains(&serde_json::json!("auth_token")));
    }

    #[test]
    fn test_figma_style_export_softill_structure() {
        let s = figma_style_export_softill();
        assert_eq!(s.id, "figma-style-export");
        assert!(matches!(s.invocation, SoftillInvocation::HttpApi { .. }));
        assert_eq!(s.effect, "network-read-only");
    }

    #[test]
    fn test_design_sync_combo_structure() {
        let c = design_sync_combo();
        assert_eq!(c.id, "design-sync");
        assert_eq!(c.skills.len(), 1);
        assert_eq!(c.softills.len(), 2);
        assert!(c.organ_dependencies.contains(&"network".to_string()));
        assert!(!c.when_to_use.is_empty());
    }

    #[test]
    fn test_design_sync_in_registry() {
        let mut reg = ComboRegistry::new();
        reg.register(design_sync_combo());
        assert!(reg.get("design-sync").is_some());
    }

    #[test]
    fn test_softill_invocation_serde_roundtrip() {
        let inv = SoftillInvocation::HttpApi {
            url_template: "https://api.figma.com/v1/files/{key}".into(),
            method: "GET".into(),
            headers: vec![("X-Figma-Token".into(), "{token}".into())],
            body_template: None,
        };
        let json = serde_json::to_string(&inv).unwrap();
        let deserialized: SoftillInvocation = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized, SoftillInvocation::HttpApi { .. }));
    }

    #[test]
    fn test_figma_softills_have_schema() {
        for s in &[figma_file_read_softill(), figma_style_export_softill()] {
            assert!(!s.description.is_empty());
            let schema = &s.input_schema;
            assert!(schema.get("properties").is_some(), "Softill {} missing input_schema", s.id);
            assert!(!s.output_description.is_empty(), "Softill {} missing output_description", s.id);
        }
    }
}
