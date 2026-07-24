use std::sync::Arc;

use crate::event::envelope::{Actor, EventEnvelope};
use crate::port::model_provider::ModelProvider;
use soma_model::types::{ModelMessage, SomaModelEvent, SomaModelRequest, ToolCall, ToolDefinition};
use soma_store::store::CaseStore;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use uuid::Uuid;

const MODEL_TIMEOUT: Duration = Duration::from_secs(120);

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
    tools: Vec<ToolDefinition>,
    /// 已接受的 Observation，用于下一轮模型请求
    observation_history: Vec<String>,
    /// 可选的持久化存储
    store: Option<Arc<dyn CaseStore>>,
}

impl TurnEngine {
    pub fn new(provider: Box<dyn ModelProvider + Send + Sync>, case_id: String) -> Self {
        Self::with_store(provider, case_id, None)
    }

    pub fn with_store(
        provider: Box<dyn ModelProvider + Send + Sync>,
        case_id: String,
        store: Option<Arc<dyn CaseStore>>,
    ) -> Self {
        let turn_id = Uuid::new_v4().to_string();
        Self {
            state: TurnState::Idle,
            provider: Arc::from(provider),
            events: Vec::new(),
            sequence: 0,
            case_id,
            turn_id,
            tools: Vec::new(),
            observation_history: Vec::new(),
            store,
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

    fn persist_event(&self, event: &EventEnvelope) {
        if let Some(store) = &self.store {
            if let Ok(json) = serde_json::to_value(event) {
                let case_event = soma_store::store::CaseEvent {
                    case_id: event.case_id.clone(),
                    event_type: event.event_type.clone(),
                    payload: json,
                    version: event.event_version as u64,
                };
                let _ = store.append(&event.case_id, &case_event);
            }
        }
    }

    fn record_event(&mut self, event_type: &str, event_version: u16, actor: Actor, payload: serde_json::Value) -> EventEnvelope {
        let event = EventEnvelope::new(
            self.case_id.clone(),
            self.next_sequence(),
            event_type,
            event_version,
            actor,
            payload,
        );
        self.persist_event(&event);
        event
    }

    /// 接收用户问题，进入 AwaitingModel
    pub fn start(&mut self, question: &str, tools: Vec<ToolDefinition>) {
        self.state = TurnState::AwaitingModel;
        self.tools = tools.clone();

        self.record_and_push("turn.started", 1, Actor::User, serde_json::json!({
            "question": question,
            "tools": tools,
        }));
    }

    fn record_and_push(&mut self, event_type: &str, event_version: u16, actor: Actor, payload: serde_json::Value) {
        let event = self.record_event(event_type, event_version, actor, payload);
        self.events.push(event);
    }

    /// 构造当前 Context 对应的 SomaModelRequest
    fn build_request(&self) -> SomaModelRequest {
        let mut messages = Vec::new();

        // 加入已接受的观察结果作为 user messages
        for obs in &self.observation_history {
            messages.push(ModelMessage {
                role: "user".to_string(),
                content: obs.clone(),
                tool_call_id: None,
            });
        }

        SomaModelRequest {
            messages,
            tools: self.tools.clone(),
            max_tokens: Some(4096),
        }
    }

    /// 发起模型请求，消费流式事件
    /// 返回 (text_deltas, Option<ToolCall>)
    pub async fn request_model(&mut self) -> Result<(String, Option<ToolCall>), String> {
        if self.state != TurnState::AwaitingModel {
            return Err(format!("invalid state for request_model: {:?}", self.state));
        }

        let (tx, mut rx) = mpsc::channel(64);

        let request = self.build_request();

        // 用 tokio::spawn 运行 provider（共享当前 runtime）
        let provider = self.provider.clone();
        let task = tokio::spawn(async move {
            provider.complete_stream(request, tx).await
        });

        let mut text = String::new();
        let mut tool_call: Option<ToolCall> = None;
        let mut pending_events: Vec<EventEnvelope> = Vec::new();
        let mut failed = None;

        // 带超时的模型请求
        let result = timeout(MODEL_TIMEOUT, async {
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
        }).await;

        match result {
            Ok(()) => {
                // rx 正常关闭
            }
            Err(_elapsed) => {
                self.state = TurnState::Failed("model timeout".to_string());
                return Err("model timed out after 120s".to_string());
            }
        }

        // 检查 provider task 是否成功
        match task.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                if failed.is_none() {
                    self.state = TurnState::Failed(e.clone());
                    return Err(format!("provider error: {}", e));
                }
            }
            Err(e) => {
                self.state = TurnState::Failed(format!("task join error: {}", e));
                return Err(format!("task join error: {}", e));
            }
        }

        if let Some(err) = failed {
            self.state = TurnState::Failed(err.clone());
            return Err(err);
        }

        // 持久化 pending_events 到 store
        for event in &pending_events {
            self.persist_event(event);
        }
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

        // 保存 observation 供下一轮模型请求使用
        self.observation_history.push(observation.to_string());

        self.record_and_push("observation.accepted", 1, Actor::User, serde_json::json!({
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
        self.record_and_push("claim.proposed", 1, Actor::Model, serde_json::json!({
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

    /// 从 store 恢复 Case（M1 简化：验证事件存在，不完整回放）
    pub fn resume(
        provider: Box<dyn ModelProvider + Send + Sync>,
        case_id: &str,
        store: Arc<dyn CaseStore>,
    ) -> Result<Self, String> {
        let events = store.replay(case_id).map_err(|e| format!("replay error: {}", e))?;
        if events.is_empty() {
            return Err(format!("no events found for case {}", case_id));
        }
        Ok(Self::with_store(provider, case_id.to_string(), Some(store)))
    }
}
