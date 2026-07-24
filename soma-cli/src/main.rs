use async_trait::async_trait;
use clap::{Parser, Subcommand};
use soma_core::port::model_provider::ModelProvider;
use soma_model::types::{SomaModelEvent, SomaModelRequest, ToolCall, ToolDefinition};
use tokio::sync::mpsc;
use tracing_subscriber::EnvFilter;

/// 双阶段 Provider：第一次调用返回 ToolCall, 第二次返回最终文本
struct TwoPhaseProvider {
    phase: std::sync::atomic::AtomicU8,
}

impl TwoPhaseProvider {
    fn new() -> Self {
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
                // 第一阶段：思考 → 请求工具
                sender
                    .send(SomaModelEvent::TextDelta(
                        "我来检查一下项目的文件结构...".to_string(),
                    ))
                    .await
                    .map_err(|e| e.to_string())?;
                sender
                    .send(SomaModelEvent::ToolCallStarted(ToolCall {
                        id: "tc_001".to_string(),
                        name: "file.read".to_string(),
                        arguments: serde_json::json!({"path": "src/main.rs"}),
                    }))
                    .await
                    .map_err(|e| e.to_string())?;
                sender
                    .send(SomaModelEvent::ResponseCompleted)
                    .await
                    .map_err(|e| e.to_string())?;
            }
            _ => {
                // 第二阶段：基于 Observation 输出结论
                sender
                    .send(SomaModelEvent::TextDelta(
                        "问题已确认：前端请求路径 /api/profile 与后端实际路由 /api/v1/profile 不匹配。建议将 src/api/profile.ts 中的请求路径改为 /api/v1/profile。"
                            .to_string(),
                    ))
                    .await
                    .map_err(|e| e.to_string())?;
                sender
                    .send(SomaModelEvent::ResponseCompleted)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
}

#[derive(Parser)]
#[command(name = "soma", version = "0.1.0", about = "SomaOS CLI — AI-native work runtime")]
struct Cli {
    #[command(subcommand)]
    commands: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Investigate a problem in the current project
    Investigate {
        /// Problem description
        query: String,
    },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();
    match &cli.commands {
        Commands::Investigate { query } => run(query).await,
    }
}

async fn run(query: &str) {
    let case_id = format!("SOMA-{:04}", 1u32);
    println!("🧪 Case {} 已创建", case_id);
    println!("📋 目标：{}", query);

    let provider = Box::new(TwoPhaseProvider::new());
    let mut engine = soma_core::engine::turn_engine::TurnEngine::new(provider, case_id);

    engine.start(
        query,
        vec![ToolDefinition {
            name: "file.read".to_string(),
            description: "读取文件内容".to_string(),
            parameters: serde_json::json!({
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }),
        }],
    );

    println!("\n🔍 正在调查...\n");

    match engine.request_model().await {
        Ok((text, Some(tc))) => {
            tracing::info!(text_len = text.len(), tool = %tc.name, "model requested tool");

            println!("  模型思考: {}", text);
            println!();
            println!("⚡ 请求使用能力：「{}」", tc.name);
            println!("   参数: {}", serde_json::to_string_pretty(&tc.arguments).unwrap());
            println!();

            // 用户授权（阻塞等待输入）
            print!("🔐 是否授权？[Y/n] ");
            std::io::Write::flush(&mut std::io::stdout()).unwrap_or(());
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap_or(0);
            let obs = if input.trim().to_lowercase() == "n" {
                "用户拒绝了请求"
            } else {
                "用户已授权，文件内容正常"
            };

            engine.provide_observation(obs).unwrap();
            println!("\n🔍 继续调查...\n");

            // 使用 continue_turn 在同一引擎上继续
            match engine.continue_turn().await {
                Ok((cont_text, _)) => {
                    engine.finish(&cont_text);
                    println!("  模型: {}", cont_text);
                    println!();
                    println!("✅ Case 已解决");
                    println!("   事件数: {}", engine.events().len());
                    println!("   最终状态: {:?}", engine.state());
                }
                Err(e) => {
                    eprintln!("[error] {}", e);
                    println!("❌ 调查失败：{}", e);
                }
            }
        }
        Ok((text, None)) => {
            engine.finish(&text);
            println!("  模型: {}", text);
            println!("\n✅ 调查完成（无需额外操作）");
        }
        Err(e) => {
            eprintln!("[error] {}", e);
            println!("❌ 调查失败：{}", e);
        }
    }
}
