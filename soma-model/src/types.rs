use serde::{Deserialize, Serialize};

/// A request sent to a model provider for completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SomaModelRequest {
    pub messages: Vec<ModelMessage>,
    pub tools: Vec<ToolDefinition>,
    pub max_tokens: Option<u32>,
}

/// A single message in the conversation sent to the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMessage {
    /// "system" | "user" | "assistant" | "tool"
    pub role: String,
    pub content: String,
    pub tool_call_id: Option<String>,
}

/// A tool definition that the model may call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

/// A tool call issued by the model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// Events emitted by a model provider during streaming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SomaModelEvent {
    TextDelta(String),
    ReasoningDelta(String),
    ToolCallStarted(ToolCall),
    ToolCallCompleted {
        call: ToolCall,
        result: serde_json::Value,
    },
    ResponseCompleted,
    ResponseFailed(String),
}
