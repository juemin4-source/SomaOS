// GATE-SOMA-NATIVE-002A P0/P1: Rig's DeepSeek provider direct test
// Tests if preamble (system prompt) and tools reach DeepSeek API.

use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::{CompletionModel, CompletionRequestBuilder};
use rig_core::providers::deepseek;
use rig_core::streaming::StreamedAssistantContent;

#[tokio::test]
async fn test_preamble_sentinel() {
    let api_key = std::env::var("DEEPSEEK_API_KEY").unwrap_or_default();
    if api_key.is_empty() { eprintln!("SKIP"); return; }

    let model_name = std::env::var("SOMA_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".into());
    let client = deepseek::Client::new(&api_key).unwrap();
    let model = client.completion_model(&model_name);

    let req = CompletionRequestBuilder::new(model.clone(), "回复一句话。")
        .preamble("你必须在回答开头输出 SOMA-SENTINEL-7F31。".to_string())
        .temperature(0.0)
        .max_tokens(256)
        .build();

    let mut stream = model.stream(req).await.unwrap();
    let mut text = String::new();
    let mut done = false;

    while let Some(chunk) = stream.next().await {
        match chunk.unwrap() {
            StreamedAssistantContent::Text(t) => text.push_str(&t.text),
            StreamedAssistantContent::Final(_) => done = true,
            _ => {}
        }
        if done { break; }
    }

    eprintln!("=== Rig direct: preamble test ===");
    eprintln!("{}", text);
    assert!(text.contains("SOMA-SENTINEL-7F31"),
        "Preamble (system prompt) NOT visible to model. Rig may not send it as system role.");
}

#[tokio::test]
async fn test_tool_call() {
    let api_key = std::env::var("DEEPSEEK_API_KEY").unwrap_or_default();
    if api_key.is_empty() { eprintln!("SKIP"); return; }

    let model_name = std::env::var("SOMA_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".into());
    let client = deepseek::Client::new(&api_key).unwrap();
    let model = client.completion_model(&model_name);

    let mut builder = CompletionRequestBuilder::new(model.clone(), "调用 get_gate_token 工具。")
        .preamble("你有一个工具 get_gate_token，调用它得到 token 然后告诉我。".to_string())
        .temperature(0.0)
        .max_tokens(512)
        .tool(rig_core::completion::ToolDefinition {
            name: "get_gate_token".into(),
            description: "Return a secret token.".into(),
            parameters: serde_json::json!({"type":"object","properties":{},"additionalProperties":false}),
        });
    let req = builder.build();

    let mut stream = model.stream(req).await.unwrap();
    let mut tool_name = String::new();
    let mut text = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk.unwrap() {
            StreamedAssistantContent::Text(t) => text.push_str(&t.text),
            StreamedAssistantContent::ToolCall { tool_call, .. } => {
                tool_name = tool_call.function.name.clone();
                eprintln!("TOOL CALL: {} args={}", tool_call.function.name, tool_call.function.arguments);
            }
            StreamedAssistantContent::Final(_) => break,
            _ => {}
        }
    }

    assert!(!tool_name.is_empty(), "No tool call — tool definitions not reaching DeepSeek");
    assert_eq!(tool_name, "get_gate_token", "Wrong tool name called");
    eprintln!("=== Rig direct: tool call PASS ===");
}
