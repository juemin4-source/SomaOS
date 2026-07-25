use serde::{Deserialize, Serialize};

/// Softill — AI 可调用的软件能力
///
/// Softill 可以由 CLI、脚本、API、MCP 工具、本地程序实现。
/// Softill = 软件实现 + AI 可理解的使用说明。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Softill {
    /// 唯一标识
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 一句话说明
    pub description: String,
    /// 调用方式
    pub invocation: SoftillInvocation,
    /// 输入 schema
    pub input_schema: serde_json::Value,
    /// 输出说明
    pub output_description: String,
    /// 副作用（只读/写入本地/网络/全局）
    pub effect: String,
}

/// 调用方式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SoftillInvocation {
    /// 命令行工具
    Command {
        command: String,
        args_template: String,
    },
    /// MCP 工具
    McpTool {
        tool_name: String,
    },
    /// 脚本
    Script {
        path: String,
        interpreter: String,
    },
    /// HTTP API（REST / GraphQL 等外部服务）
    HttpApi {
        /// 请求 URL（支持模板变量，如 https://api.figma.com/v1/files/{file_key}）
        url_template: String,
        /// HTTP 方法
        method: String,
        /// 请求头模板
        headers: Vec<(String, String)>,
        /// 请求体模板（可选）
        body_template: Option<String>,
    },
}

impl Softill {
    pub fn new(id: &str, name: &str, description: &str, invocation: SoftillInvocation, effect: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            invocation,
            input_schema: serde_json::json!({}),
            output_description: String::new(),
            effect: effect.to_string(),
        }
    }
}
