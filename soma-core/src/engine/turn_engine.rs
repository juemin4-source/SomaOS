use std::sync::Arc;

use crate::event::envelope::{Actor, EventEnvelope};
use crate::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall, ToolDefinition};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub enum TurnState {
    Idle,
    AwaitingModel,
    ActionRequested {
        tool_call: ToolCall,
    },
    AwaitingObservation {
        tool_call: ToolCall,
    },
    Completed,
    Failed(String),
}

pub struct TurnEngine {
    state: TurnState,
    provider: Arc<dyn ModelProvider + Send + Sync>,
    events: Vec<EventEnvelope>,
    sequence: u64,
    case_id: String,
    turn_id: String,
}

impl TurnEngine {
    pub fn new(provider: Box<dyn ModelProvider + Send + Sync>, case_id: String) -> Self {
        let turn_id = Uuid::new_v4().to_string();
        Self {
            state: TurnState::Idle,
            provider: Arc::from(provider),
            events: Vec::new(),
            sequence: 0,
            case_id,
            turn_id,
        }
    }

    pub fn state(&self) -> &TurnState {
        &self.state
    }

    fn next_sequence(&mut self) -> u64 {
        let s = self.sequence;
        self.sequence += 1;
        s
    }

    fn push_event(&mut self, event_type: &str, event_version: u16, actor: Actor, payload: serde_json::Value) {
        let event = EventEnvelope::new(
            self.case_id.clone(),
            self.next_sequence(),
            event_type,
            event_version,
            actor,
            payload,
        );
        self.events.push(event);
    }

    /// 接收用户问题，进入 AwaitingModel
    pub fn start(&mut self, question: &str, tools: Vec<ToolDefinition>) {
        self.state = TurnState::AwaitingModel;

        let event = EventEnvelope::new(
            self.case_id.clone(),
            self.next_sequence(),
            "turn.started",
            1,
            Actor::User,
            serde_json::json!({
                "question": question,
                "tools": tools,
            }),
        );
        self.events.push(event);
    }

    /// 发起模型请求，消费流式事件
    /// 返回 (text_deltas, Option<ToolCall>)
    pub async fn request_model(&mut self) -> Result<(String, Option<ToolCall>), String> {
        if self.state != TurnState::AwaitingModel {
            return Err(format!("invalid state for request_model: {:?}", self.state));
        }

        let (tx, mut rx) = mpsc::channel(64);

        let request = SomaModelRequest {
            messages: vec![],
            tools: vec![],
            max_tokens: None,
        };

        // 用独立线程运行 provider（Arc clone 避免 borrow 冲突）
        let provider = self.provider.clone();
        let task = std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                provider.complete_stream(request, tx).await
            })
        });

        let mut text = String::new();
        let mut tool_call: Option<ToolCall> = None;
        let mut pending_events: Vec<EventEnvelope> = Vec::new();
        let mut failed = None;

        while let Some(event) = rx.recv().await {
            match event {
                SomaModelEvent::TextDelta(delta) => {
                    text.push_str(&delta);
                    pending_events.push(EventEnvelope::new(
                        self.case_id.clone(), self.next_sequence(),
                        "model.text_delta", 1, Actor::Model,
                        serde_json::json!({"delta": delta}),
                    ));
                }
                SomaModelEvent::ReasoningDelta(delta) => {
                    pending_events.push(EventEnvelope::new(
                        self.case_id.clone(), self.next_sequence(),
                        "model.reasoning_delta", 1, Actor::Model,
                        serde_json::json!({"delta": delta}),
                    ));
                }
                SomaModelEvent::ToolCallStarted(tc) => {
                    tool_call = Some(tc.clone());
                    pending_events.push(EventEnvelope::new(
                        self.case_id.clone(), self.next_sequence(),
                        "action.requested", 1, Actor::Model,
                        serde_json::json!({"tool_call": tc}),
                    ));
                }
                SomaModelEvent::ToolCallCompleted { call, result } => {
                    pending_events.push(EventEnvelope::new(
                        self.case_id.clone(), self.next_sequence(),
                        "action.completed", 1, Actor::Model,
                        serde_json::json!({"tool_call": call, "result": result}),
                    ));
                }
                SomaModelEvent::ResponseCompleted => {
                    pending_events.push(EventEnvelope::new(
                        self.case_id.clone(), self.next_sequence(),
                        "turn.response_completed", 1, Actor::Model,
                        serde_json::Value::Null,
                    ));
                }
                SomaModelEvent::ResponseFailed(err) => {
                    failed = Some(err.clone());
                }
            }
        }

        // 等待 provider 线程结束
        match task.join() {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(format!("provider error: {}", e)),
            Err(_) => return Err("provider thread panicked".to_string()),
        }

        if let Some(err) = failed {
            self.state = TurnState::Failed(err.clone());
            return Err(err);
        }

        // 批量追加事件到 self.events
        self.events.append(&mut pending_events);

        if let Some(tc) = tool_call.as_ref() {
            self.state = TurnState::ActionRequested {
                tool_call: tc.clone(),
            };
        } else {
            self.state = TurnState::Completed;
        }

        Ok((text, tool_call))
    }

    /// 用户提供 Observation 后进入等待继续
    pub fn provide_observation(&mut self, observation: &str) -> Result<(), String> {
        let tool_call = match &self.state {
            TurnState::ActionRequested { tool_call } => tool_call.clone(),
            _ => return Err(format!("invalid state for provide_observation: {:?}", self.state)),
        };
        self.push_event("observation.accepted", 1, Actor::User, serde_json::json!({
            "tool_call": tool_call,
            "observation": observation,
        }));
        self.state = TurnState::AwaitingObservation { tool_call };
        Ok(())
    }

    /// 继续下一轮模型请求（收到 Observation 后）
    pub async fn continue_turn(&mut self) -> Result<(String, Option<ToolCall>), String> {
        if !matches!(self.state, TurnState::AwaitingObservation { .. }) {
            return Err(format!("invalid state for continue_turn: {:?}", self.state));
        }
        self.state = TurnState::AwaitingModel;
        self.request_model().await
    }

    /// 结束 turn，生成 ClaimProposed
    pub fn finish(&mut self, claim: &str) {
        self.push_event("claim.proposed", 1, Actor::Model, serde_json::json!({
            "claim": claim,
        }));
        self.state = TurnState::Completed;
    }

    pub fn events(&self) -> &[EventEnvelope] {
        &self.events
    }

    pub fn case_id(&self) -> &str {
        &self.case_id
    }

    pub fn turn_id(&self) -> &str {
        &self.turn_id
    }
}
