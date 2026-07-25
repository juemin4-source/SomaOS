//! # Soma — 统一 CLI + TUI 入口
//!
//! ```bash
//! soma                  # 交互式 TUI
//! soma investigate ...  # 命令行调查
//! ```

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "soma", version = "0.2.0", about = "SomaOS — AI-native work runtime")]
struct Cli {
    #[command(subcommand)]
    commands: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Investigate a problem in the current project
    Investigate {
        query: String,
    },
    /// Resume a previous case
    Resume {
        case_id: String,
    },
    /// Pipeline status and description
    Pipeline {
        #[command(subcommand)]
        command: PipelineCommand,
    },
    /// Export a Softill
    Softill {
        #[command(subcommand)]
        command: SoftillCommand,
    },
    /// Capability gap analysis
    Gap {
        #[command(subcommand)]
        command: GapCommand,
    },
}

#[derive(Subcommand)]
enum PipelineCommand {
    Describe { query: String },
}

#[derive(Subcommand)]
enum GapCommand {
    Search { query: String },
    Propose { query: String },
}

#[derive(Subcommand)]
enum SoftillCommand {
    Export { softill_id: String, #[arg(short, long, default_value = ".")] output: String },
}

fn main() -> Result<(), i32> {
    let cli = Cli::parse();

    match &cli.commands {
        None => {
            // 无子命令 → 启动交互式 TUI
            start_tui()?;
            Ok(())
        }
        Some(cmd) => {
            // 有子命令 → 启动 tokio runtime 执行
            let rt = tokio::runtime::Runtime::new().map_err(|e| {
                eprintln!("Runtime error: {}", e);
                1
            })?;
            let result = rt.block_on(dispatch_command(cmd));
            if let Err(code) = result {
                std::process::exit(code);
            }
            Ok(())
        }
    }
}

fn start_tui() -> Result<(), i32> {
    // 由于 TUI 需要自己的 tokio runtime 和 eye_declare 初始化，
    // 委托给 soma_tui::run 函数
    soma_tui::run().map_err(|e| {
        eprintln!("TUI error: {}", e);
        1
    })
}

// ── 子命令分发 ──────────────────────────────────────────────────

async fn dispatch_command(cmd: &Commands) -> Result<(), i32> {
    match cmd {
        Commands::Investigate { query } => run_investigate(query).await,
        Commands::Resume { case_id } => run_resume(case_id).await,
        Commands::Pipeline { command } => match command {
            PipelineCommand::Describe { query } => run_pipeline_describe(query).await,
        },
        Commands::Gap { command } => match command {
            GapCommand::Search { query } => run_gap_search(query).await,
            GapCommand::Propose { query } => run_gap_propose(query).await,
        },
        Commands::Softill { command } => match command {
            SoftillCommand::Export { softill_id, output } => run_softill_export(softill_id, output).await,
        },
    }
}

// ── 子命令处理 ──────────────────────────────────────────────────

async fn run_investigate(query: &str) -> Result<(), i32> {
    use soma_client::SomaClient;

    let client = SomaClient::connect(".").await.map_err(|e| {
        eprintln!("Failed to connect: {}", e);
        1
    })?;

    println!("📋 {}", query);
    client.send_message(query).await.map_err(|e| {
        eprintln!("Failed to send: {}", e);
        1
    })?;

    // Subscribe to events
    let mut rx = client.subscribe_events();

    while let Ok(envelope) = rx.recv().await {
        match &envelope.kind {
            soma_protocol::events::RuntimeEventKind::AssistantDelta => {
                if let Some(text) = envelope.payload.get("text").and_then(|v| v.as_str()) {
                    print!("{}", text);
                    use std::io::Write;
                    std::io::stdout().flush().ok();
                }
            }
            soma_protocol::events::RuntimeEventKind::ToolStarted => {
                let name = envelope.payload.get("capability_id")
                    .and_then(|v| v.as_str()).unwrap_or("?");
                println!("\n[Tool: {}]", name);
            }
            soma_protocol::events::RuntimeEventKind::ToolCompleted => {
                let ok = envelope.payload.get("success")
                    .and_then(|v| v.as_bool()).unwrap_or(false);
                println!(" -> {}", if ok { "OK" } else { "FAIL" });
            }
            soma_protocol::events::RuntimeEventKind::TurnCompleted => {
                println!("\nDone");
                break;
            }
            soma_protocol::events::RuntimeEventKind::TurnFailed => {
                let err = envelope.payload.get("error")
                    .and_then(|v| v.as_str()).unwrap_or("?");
                eprintln!("\nFailed: {}", err);
                return Err(1);
            }
            _ => {}
        }
    }
    Ok(())
}

async fn run_resume(_case_id: &str) -> Result<(), i32> {
    println!("Resume — not yet migrated to SomaClient");
    Ok(())
}

async fn run_pipeline_describe(_query: &str) -> Result<(), i32> {
    println!("Pipeline describe — not yet migrated to SomaClient");
    Ok(())
}

async fn run_gap_search(_query: &str) -> Result<(), i32> {
    println!("Gap search — not yet migrated to SomaClient");
    Ok(())
}

async fn run_gap_propose(_query: &str) -> Result<(), i32> {
    println!("Gap propose — not yet migrated to SomaClient");
    Ok(())
}

async fn run_softill_export(_softill_id: &str, _output: &str) -> Result<(), i32> {
    println!("Softill export — not yet migrated to SomaClient");
    Ok(())
}
