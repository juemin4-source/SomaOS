//! Rig adapter: implements SomaOS ModelProvider using Rig's Anthropic provider.
//!
//! Requires `ANTHROPIC_API_KEY` environment variable to be set.

use async_trait::async_trait;
use rig_core::client::CompletionClient;
use rig_core::completion::{AssistantContent, CompletionModel, CompletionRequestBuilder};
use rig_core::providers::anthropic;
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall};
use tokio::sync::mpsc;

/// Rig-backed provider for Anthropic Claude models.
pub struct RigClaudeProvider {
    model: anthropic::completion::GenericCompletionModel,
    system_prompt: String,
}

impl RigClaudeProvider {
    /// Create from env. Requires ANTHROPIC_API_KEY.
    pub fn from_env() -> Result<Self, String> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| "ANTHROPIC_API_KEY not set".to_string())?;
        let model_name = std::env::var("SOMA_MODEL")
            .unwrap_or_else(|_| "claude-sonnet-4-6".to_string());
        let client = anthropic::Client::new(&api_key)
            .map_err(|e| format!("failed to create Anthropic client: {}", e))?;
        let model = client.completion_model(&model_name);
        Ok(Self { model, system_prompt: String::new() })
    }

    pub fn with_system_prompt(mut self, prompt: &str) -> Self {
        self.system_prompt = prompt.to_string();
        self
    }
}

#[async_trait]
impl ModelProvider for RigClaudeProvider {
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
        builder = builder.preamble(self.system_prompt.clone()).temperature(0.3).max_tokens(u64::from(request.max_tokens.unwrap_or(4096)));
        if !tools.is_empty() {
            builder = builder.tools(tools);
        }
        let req = builder.build();

        let response = self.model.completion(req).await.map_err(|e| format!("Rig error: {}", e))?;

        for item in response.choice.iter() {
            match item {
                AssistantContent::Text(t) => {
                    sender.send(SomaModelEvent::TextDelta(t.text.clone())).await.ok();
                }
                AssistantContent::ToolCall(tc) => {
                    sender.send(SomaModelEvent::ToolCallStarted(ToolCall {
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        arguments: tc.function.arguments.clone(),
                    })).await.ok();
                }
                AssistantContent::Reasoning(r) => {
                    for block in &r.content {
                        if let rig_core::message::ReasoningContent::Text { text, .. } = block {
                            sender.send(SomaModelEvent::ReasoningDelta(text.clone())).await.ok();
                        }
                    }
                }
                _ => {}
            }
        }
        sender.send(SomaModelEvent::ResponseCompleted).await.ok();
        Ok(())
    }
}

pub fn claude_provider() -> RigClaudeProvider {
    RigClaudeProvider::from_env().expect("ANTHROPIC_API_KEY must be set")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_env_missing_key() {
        let result = RigClaudeProvider::from_env();
        assert!(result.is_err());
    }
}
