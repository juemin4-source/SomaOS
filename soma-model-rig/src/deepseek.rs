//! DeepSeek provider using Rig's built-in DeepSeek support.
//!
//! Requires `DEEPSEEK_API_KEY` environment variable.

use async_trait::async_trait;
use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::{CompletionModel, CompletionRequestBuilder};
use rig_core::message::ReasoningContent;
use rig_core::providers::deepseek;
use rig_core::streaming::StreamedAssistantContent;
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall};
use tokio::sync::mpsc;

/// DeepSeek provider using Rig's native adapter.
pub struct DeepSeekProvider {
    model: deepseek::CompletionModel,
    system_prompt: String,
}

impl DeepSeekProvider {
    /// Create from env. Requires DEEPSEEK_API_KEY.
    pub fn from_env() -> Result<Self, String> {
        let api_key = std::env::var("DEEPSEEK_API_KEY")
            .map_err(|_| "DEEPSEEK_API_KEY not set".to_string())?;
        let model_name = std::env::var("SOMA_MODEL")
            .unwrap_or_else(|_| "deepseek-chat".to_string());

        let client = deepseek::Client::new(&api_key)
            .map_err(|e| format!("failed to create DeepSeek client: {}", e))?;
        let model = client.completion_model(&model_name);
        Ok(Self { model, system_prompt: String::new() })
    }

    pub fn with_system_prompt(mut self, prompt: &str) -> Self {
        self.system_prompt = prompt.to_string();
        self
    }
}

#[async_trait]
impl ModelProvider for DeepSeekProvider {
    async fn complete_stream(
        &self,
        request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        let tools: Vec<rig_core::completion::ToolDefinition> = request.tools.iter().map(|t| {
            rig_core::completion::ToolDefinition {
                name: t.name.clone(),
                description: t.description.clone(),
                parameters: t.parameters.clone(),
            }
        }).collect();

        let mut builder = CompletionRequestBuilder::new(self.model.clone(), "");
        builder = builder.preamble(self.system_prompt.clone())
            .temperature(0.3)
            .max_tokens(u64::from(request.max_tokens.unwrap_or(4096)));
        if !tools.is_empty() {
            builder = builder.tools(tools);
        }
        let req = builder.build();

        let mut stream = self.model.stream(req).await
            .map_err(|e| format!("DeepSeek stream error: {}", e))?;

        while let Some(chunk) = stream.next().await {
            match chunk.map_err(|e| format!("stream chunk error: {}", e))? {
                StreamedAssistantContent::Text(text) => {
                    let _ = sender.send(SomaModelEvent::TextDelta(text.text)).await;
                }
                StreamedAssistantContent::ToolCall { tool_call, .. } => {
                    let _ = sender.send(SomaModelEvent::ToolCallStarted(ToolCall {
                        id: tool_call.id.clone(),
                        name: tool_call.function.name,
                        arguments: tool_call.function.arguments,
                    })).await;
                }
                StreamedAssistantContent::ToolCallDelta { .. } => {}
                StreamedAssistantContent::Reasoning(reasoning) => {
                    for block in &reasoning.content {
                        if let ReasoningContent::Text { text, .. } = block {
                            let _ = sender.send(SomaModelEvent::ReasoningDelta(text.clone())).await;
                        }
                    }
                }
                StreamedAssistantContent::ReasoningDelta { reasoning, .. } => {
                    let _ = sender.send(SomaModelEvent::ReasoningDelta(reasoning)).await;
                }
                StreamedAssistantContent::Final(_response) => {}
                StreamedAssistantContent::Unknown(_) => {}
            }
        }

        let _ = sender.send(SomaModelEvent::ResponseCompleted).await;
        Ok(())
    }
}

pub fn deepseek_provider() -> DeepSeekProvider {
    DeepSeekProvider::from_env().expect("DEEPSEEK_API_KEY must be set")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env_key_dependent() {
        let result = DeepSeekProvider::from_env();
        if std::env::var("DEEPSEEK_API_KEY").is_ok() {
            assert!(result.is_ok(), "should succeed when DEEPSEEK_API_KEY is set");
        } else {
            assert!(result.is_err(), "should fail when DEEPSEEK_API_KEY is not set");
        }
    }
}
