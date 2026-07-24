//! GATE-SOMA-NATIVE-002A: ModelProvider Conformance Probes
//!
//! Each probe tests one layer of the Provider→Harness chain.
//! Usage: cargo run -p soma-gate-runner --bin probe -- <probe-name>
//!
//! Probes: p0, p1, p2, p3, p4, p5, p6

use std::sync::Arc;
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::*;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() {
    let probe = std::env::args().nth(1).unwrap_or_else(|| "p0".into());
    let model = std::env::var("SOMA_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".into());
    let use_thinking = std::env::var("SOMA_THINKING").is_ok();

    let provider = build_provider(&model).expect("set DEEPSEEK_API_KEY");
    let provider = Arc::from(provider);

    match probe.as_str() {
        "p0" => probe_p0(provider, &model, use_thinking).await,
        "p1" => probe_p1(provider, &model, use_thinking).await,
        "p2" => probe_p2(provider, &model, use_thinking).await,
        "p3" => probe_p3(provider, &model, use_thinking).await,
        "p4" => probe_p4(provider, &model, use_thinking).await,
        "p5" => probe_p5(provider, &model, use_thinking).await,
        "p6" => probe_p6(provider, &model, use_thinking).await,
        _ => eprintln!("unknown probe: {}", probe),
    }
}

fn build_provider(model: &str) -> Option<Box<dyn ModelProvider + Send + Sync>> {
    std::env::set_var("SOMA_MODEL", model);
    if let Ok(p) = soma_model_rig::deepseek::DeepSeekProvider::from_env() {
        Some(Box::new(p))
    } else if let Ok(p) = soma_model_rig::RigClaudeProvider::from_env() {
        Some(Box::new(p))
    } else {
        None
    }
}

fn run_provider(provider: Arc<dyn ModelProvider + Send + Sync>, req: SomaModelRequest) -> (mpsc::Receiver<SomaModelEvent>, String) {
    let request_json = serde_json::to_string_pretty(&req).unwrap_or_default();
    let (tx, rx) = mpsc::channel(64);
    tokio::spawn(async move {
        let _ = provider.complete_stream(req, tx).await;
    });
    (rx, request_json)
}

async fn collect_events(rx: &mut mpsc::Receiver<SomaModelEvent>) -> (Vec<SomaModelEvent>, String) {
    let mut events = vec![];
    let mut text = String::new();
    while let Some(event) = rx.recv().await {
        match &event {
            SomaModelEvent::TextDelta(d) => text.push_str(d),
            SomaModelEvent::ResponseCompleted => break,
            SomaModelEvent::ResponseFailed(e) => {
                text.push_str(&format!("[FAILED: {}]", e));
                break;
            }
            _ => {}
        }
        events.push(event);
    }
    (events, text)
}

fn print_banner(probe: &str) {
    println!("\n{}", "=".repeat(60));
    println!("PROBE: {} — {}", probe, probe_description(probe));
    println!("{}", "=".repeat(60));
}

fn probe_description(probe: &str) -> &str {
    match probe {
        "p0" => "System Prompt Sentinel",
        "p1" => "Minimal Tool Call (no params)",
        "p2" => "Tool Parameter Schema",
        "p3" => "Observation Continuation",
        "p4" => "Thinking Mode Multi-turn",
        "p5" => "Two-step Tool Chain",
        "p6" => "Minimal Fix Task",
        _ => "unknown",
    }
}

async fn probe_p0(provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p0");

    let req = SomaModelRequest {
        messages: vec![
            ModelMessage {
                role: "system".into(),
                content: "你必须在回答开头输出 SOMA-SENTINEL-7F31。".into(),
                tool_call_id: None,
            },
            ModelMessage {
                role: "user".into(),
                content: "回复一句话。".into(),
                tool_call_id: None,
            },
        ],
        tools: vec![],
        max_tokens: Some(256),
    };

    println!("\n── SomaModelRequest (constructed) ──");
    println!("{}", serde_json::to_string_pretty(&req).unwrap());

    let (_, text) = run_provider_and_collect(provider, req).await;

    println!("\n── Model Response ──");
    println!("{}", text);

    let sentinel_found = text.contains("SOMA-SENTINEL-7F31");
    println!("\n── RESULT ──");
    println!("sentinel_present: {}", sentinel_found);

    if sentinel_found {
        println!("VERDICT: PASS — System prompt reaches model correctly.");
    } else {
        println!("VERDICT: FAIL — System prompt NOT visible to model.");
        println!("Possible causes:");
        println!("  1. Rig's 'preamble' is sent as a different role (not 'system')");
        println!("  2. Message ordering issue (preamble before or after user message?)");
        println!("  3. Provider API version mismatch");
        std::process::exit(1);
    }
}

async fn probe_p1(provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p1");

    let req = SomaModelRequest {
        messages: vec![
            ModelMessage {
                role: "system".into(),
                content: "You have one tool available: get_gate_token. Call it to get a token, then tell me the token.".into(),
                tool_call_id: None,
            },
            ModelMessage {
                role: "user".into(),
                content: "调用 get_gate_token 工具，然后告诉我 token。".into(),
                tool_call_id: None,
            },
        ],
        tools: vec![ToolDefinition {
            name: "get_gate_token".into(),
            description: "Return the gate token.".into(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        }],
        max_tokens: Some(512),
    };

    println!("\n── Tools sent ──");
    println!("{}", serde_json::to_string_pretty(&req.tools).unwrap());

    let (events, text) = run_provider_and_collect(provider, req).await;

    let tool_calls: Vec<&SomaModelEvent> = events.iter().filter(|e| matches!(e, SomaModelEvent::ToolCallStarted(_))).collect();

    println!("\n── Model Text Output ──");
    println!("{}", text);
    println!("\n── Tool Calls Detected: {} ──", tool_calls.len());
    for tc in &tool_calls {
        if let SomaModelEvent::ToolCallStarted(tc) = tc {
            println!("  name: {}", tc.name);
            println!("  id: {}", tc.id);
            println!("  arguments: {}", tc.arguments);
        }
    }

    println!("\n── RESULT ──");
    if tool_calls.is_empty() {
        println!("VERDICT: FAIL — No tool call generated.");
        println!("Model did not call get_gate_token despite being instructed.");
        std::process::exit(1);
    } else {
        let tc = match &tool_calls[0] {
            SomaModelEvent::ToolCallStarted(tc) => tc,
            _ => unreachable!(),
        };
        if tc.name == "get_gate_token" {
            println!("VERDICT: PASS — Model correctly calls get_gate_token.");
        } else {
            println!("VERDICT: FAIL — Called '{}' instead of 'get_gate_token'.", tc.name);
            println!("Tool names may be transformed or mismatched.");
            std::process::exit(1);
        }
    }
}

async fn probe_p2(provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p2");

    // TODO: implement
    println!("P2 not yet implemented — reading fixture files requires parameter schema test.");
}

async fn probe_p3(provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p3");

    // First turn: tool call
    let req1 = SomaModelRequest {
        messages: vec![
            ModelMessage { role: "system".into(), content: "You have a tool 'get_gate_token'. Call it.".into(), tool_call_id: None },
            ModelMessage { role: "user".into(), content: "调用 get_gate_token 工具。".into(), tool_call_id: None },
        ],
        tools: vec![ToolDefinition {
            name: "get_gate_token".into(),
            description: "Return token.".into(),
            parameters: serde_json::json!({"type":"object","properties":{},"additionalProperties":false}),
        }],
        max_tokens: Some(512),
    };

    let (events1, _) = run_provider_and_collect(provider.clone(), req1).await;

    let tool_call = events1.iter().find_map(|e| {
        if let SomaModelEvent::ToolCallStarted(tc) = e { Some(tc.clone()) } else { None }
    });

    match tool_call {
        Some(tc) => {
            println!("\n── Tool Call ID: {} ──", tc.id);

            // Second turn: inject tool result and ask model to repeat
            let req2 = SomaModelRequest {
                messages: vec![
                    ModelMessage { role: "system".into(), content: "You have a tool 'get_gate_token'.".into(), tool_call_id: None },
                    ModelMessage { role: "assistant".into(), content: "".into(), tool_call_id: None },
                    ModelMessage {
                        role: "user".into(),
                        content: "上一步工具返回了 token: ORANGE-42。请复述这个 token。".into(),
                        tool_call_id: Some(tc.id.clone()),
                    },
                ],
                tools: vec![],
                max_tokens: Some(256),
            };

            println!("\n── Second turn request (tool result injected) ──");
            println!("{}", serde_json::to_string_pretty(&req2).unwrap());

            let (_, text2) = run_provider_and_collect(provider.clone(), req2).await;

            println!("\n── Model Response (should contain ORANGE-42) ──");
            println!("{}", text2);

            let has_token = text2.contains("ORANGE-42");
            println!("\n── RESULT ──");
            if has_token {
                println!("VERDICT: PASS — Model correctly receives and repeats tool result.");
            } else {
                println!("VERDICT: FAIL — Tool result not reflected in model response.");
                println!("Tool call continuation has a problem (missing history, wrong role, or dropped tool_call_id).");
                std::process::exit(1);
            }
        }
        None => {
            println!("VERDICT: FAIL — No tool call in first turn. Cannot test continuation.");
            std::process::exit(1);
        }
    }
}

async fn probe_p4(_provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p4");
    println!("P4 requires thinking mode + reasoning_content preservation.");
    println!("Not yet implemented — depends on P0-P3 results.");
}

async fn probe_p5(_provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p5");
    println!("P5: Two-step tool chain (read description → run test).");
    println!("Not yet implemented — depends on P0-P3 results.");
}

async fn probe_p6(_provider: Arc<dyn ModelProvider + Send + Sync>, _model: &str, _thinking: bool) {
    print_banner("p6");
    println!("P6: Minimal fix task (read → patch → test).");
    println!("Not yet implemented — depends on P0-P5 results.");
}

async fn run_provider_and_collect(provider: Arc<dyn ModelProvider + Send + Sync>, req: SomaModelRequest) -> (Vec<SomaModelEvent>, String) {
    let (tx, mut rx) = mpsc::channel(64);
    tokio::spawn(async move {
        let _ = provider.complete_stream(req, tx).await;
    });
    collect_events(&mut rx).await
}
