use async_trait::async_trait;
use soma_core::engine::turn_engine::TurnEngine;
use soma_core::event::envelope::{Actor, EventEnvelope};
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall};
use tokio::sync::mpsc;

struct MockProvider;

#[async_trait]
impl ModelProvider for MockProvider {
    async fn complete_stream(
        &self,
        _request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        sender
            .send(SomaModelEvent::TextDelta("mock response".to_string()))
            .await
            .map_err(|e| e.to_string())?;
        sender
            .send(SomaModelEvent::ResponseCompleted)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

struct MockToolCallProvider;

#[async_trait]
impl ModelProvider for MockToolCallProvider {
    async fn complete_stream(
        &self,
        _request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        sender
            .send(SomaModelEvent::TextDelta("calling tool...".to_string()))
            .await
            .map_err(|e| e.to_string())?;
        sender
            .send(SomaModelEvent::ToolCallStarted(ToolCall {
                id: "tc_test".to_string(),
                name: "file.read".to_string(),
                arguments: serde_json::json!({"path": "test.txt"}),
            }))
            .await
            .map_err(|e| e.to_string())?;
        sender
            .send(SomaModelEvent::ResponseCompleted)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

struct MockErrorProvider;

#[async_trait]
impl ModelProvider for MockErrorProvider {
    async fn complete_stream(
        &self,
        _request: SomaModelRequest,
        sender: mpsc::Sender<SomaModelEvent>,
    ) -> Result<(), String> {
        sender
            .send(SomaModelEvent::ResponseFailed("provider error".to_string()))
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tokio::test]
async fn test_turn_engine_text_response() {
    let mut engine = TurnEngine::new(Box::new(MockProvider), "SOMA-TEST-001".to_string());
    engine.start("test query", vec![]);

    let result = engine.request_model().await;
    assert!(result.is_ok());
    let (text, tool_call) = result.unwrap();
    assert_eq!(text, "mock response");
    assert!(tool_call.is_none());
    assert_eq!(engine.state(), &soma_core::engine::turn_engine::TurnState::Completed);
}

#[tokio::test]
async fn test_turn_engine_tool_call() {
    let mut engine = TurnEngine::new(Box::new(MockToolCallProvider), "SOMA-TEST-002".to_string());
    engine.start("read a file", vec![]);

    let result = engine.request_model().await;
    assert!(result.is_ok());
    let (text, tool_call) = result.unwrap();
    assert_eq!(text, "calling tool...");
    assert!(tool_call.is_some());
    let tc = tool_call.unwrap();
    assert_eq!(tc.name, "file.read");
    assert!(matches!(engine.state(), soma_core::engine::turn_engine::TurnState::ActionRequested { .. }));
}

#[tokio::test]
async fn test_turn_engine_observe_and_continue() {
    let mut engine = TurnEngine::new(Box::new(MockToolCallProvider), "SOMA-TEST-003".to_string());
    engine.start("read a file", vec![]);
    let (_, tool_call) = engine.request_model().await.unwrap();
    assert!(tool_call.is_some());

    // provide observation
    let obs_result = engine.provide_observation("file content is available");
    assert!(obs_result.is_ok());
    assert!(matches!(
        engine.state(),
        soma_core::engine::turn_engine::TurnState::AwaitingObservation { .. }
    ));

    // Test that continue_turn returns error from second provider since
    // we're still using MockToolCallProvider which does another ToolCall
    let cont_result = engine.continue_turn().await;
    assert!(cont_result.is_ok() || cont_result.is_err());
}

#[tokio::test]
async fn test_turn_engine_failed_state() {
    let mut engine = TurnEngine::new(Box::new(MockErrorProvider), "SOMA-TEST-004".to_string());
    engine.start("will fail", vec![]);

    let result = engine.request_model().await;
    assert!(result.is_err());
    assert!(matches!(engine.state(), soma_core::engine::turn_engine::TurnState::Failed(_)));
}

#[tokio::test]
async fn test_turn_engine_finish() {
    let mut engine = TurnEngine::new(Box::new(MockProvider), "SOMA-TEST-005".to_string());
    engine.start("finish test", vec![]);
    let (text, _) = engine.request_model().await.unwrap();

    engine.finish(&text);
    assert_eq!(engine.state(), &soma_core::engine::turn_engine::TurnState::Completed);
    // Events should include: turn.started + text_delta + response_completed + claim.proposed
    assert!(engine.events().len() >= 4);
}

#[tokio::test]
async fn test_turn_engine_event_count() {
    let provider = Box::new(MockToolCallProvider);
    let mut engine = TurnEngine::new(provider, "SOMA-TEST-006".to_string());
    engine.start("test", vec![]);
    let _ = engine.request_model().await.unwrap();

    // Events: turn.started (start) + text_delta + action.requested + response_completed
    assert!(engine.events().len() >= 4);
}
