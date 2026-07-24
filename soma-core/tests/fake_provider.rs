use async_trait::async_trait;
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest};
use tokio::sync::mpsc;

/// A fake provider for testing. Simulates a model that:
/// 1. Sends a TextDelta
/// 2. Sends a ToolCallStarted
/// 3. Sends ResponseCompleted
pub struct FakeProvider;

#[async_trait]
impl ModelProvider for FakeProvider {
    async fn complete_stream(
        &self,
        _request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        sender
            .send(SomaModelEvent::TextDelta(
                "I'll investigate this issue.".to_string(),
            ))
            .await
            .map_err(|e| format!("send error: {}", e))?;

        sender
            .send(SomaModelEvent::ToolCallStarted(
                soma_model::types::ToolCall {
                    id: "tc_001".to_string(),
                    name: "file.read".to_string(),
                    arguments: serde_json::json!({"path": "src/main.rs"}),
                },
            ))
            .await
            .map_err(|e| format!("send error: {}", e))?;

        sender
            .send(SomaModelEvent::ResponseCompleted)
            .await
            .map_err(|e| format!("send error: {}", e))?;

        Ok(())
    }
}
