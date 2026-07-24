use async_trait::async_trait;
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall};
use tokio::sync::mpsc;

/// 双阶段测试 Provider：第一次调用返回 ToolCall, 第二次返回最终文本
pub struct TwoPhaseProvider {
    phase: std::sync::atomic::AtomicU8,
}

impl TwoPhaseProvider {
    pub fn new() -> Self {
        Self {
            phase: std::sync::atomic::AtomicU8::new(0),
        }
    }
}

#[async_trait]
impl ModelProvider for TwoPhaseProvider {
    async fn complete_stream(
        &self,
        _request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        let phase = self.phase.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        match phase {
            0 => {
                sender.send(SomaModelEvent::TextDelta("检查文件结构...".to_string())).await.map_err(|e| e.to_string())?;
                sender.send(SomaModelEvent::ToolCallStarted(ToolCall {
                    id: "tc_001".to_string(),
                    name: "file.read".to_string(),
                    arguments: serde_json::json!({"path": "src/main.rs"}),
                })).await.map_err(|e| e.to_string())?;
                sender.send(SomaModelEvent::ResponseCompleted).await.map_err(|e| e.to_string())?;
            }
            _ => {
                sender.send(SomaModelEvent::TextDelta("路径不匹配：/api/profile vs /api/v1/profile".to_string())).await.map_err(|e| e.to_string())?;
                sender.send(SomaModelEvent::ResponseCompleted).await.map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}
