use clap::{Parser, Subcommand};
use soma_model::types::ToolDefinition;

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
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();
    match &cli.commands {
        Commands::Investigate { query } => run(query).await,
    }
}

async fn run(query: &str) {
    // 加载 Rig Claude Provider（需要 ANTHROPIC_API_KEY 环境变量）
    let provider = match soma_model_rig::RigClaudeProvider::from_env() {
        Ok(p) => Box::new(p) as Box<dyn soma_core::port::model_provider::ModelProvider + Send + Sync>,
        Err(e) => {
            eprintln!("SomaOS requires ANTHROPIC_API_KEY to connect to Claude.");
            eprintln!("  Set it with: $env:ANTHROPIC_API_KEY = \"sk-ant-...\"");
            eprintln!("  Or use: cargo run -- investigate <query> --demo");
            println!("❌ 无法连接模型: {}", e);
            return;
        }
    };

    let case_id = format!("SOMA-{:04}", 1u32);
    println!("🧪 Case {} 已创建", case_id);
    println!("📋 目标：{}", query);

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
