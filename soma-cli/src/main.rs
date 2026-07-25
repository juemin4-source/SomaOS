use clap::{Parser, Subcommand};
use soma_client::client::StdioClient;

#[derive(Parser)]
#[command(name = "soma", version = "0.2.0", about = "SomaOS CLI — AI-native work runtime")]
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
    /// Resume a previous case from storage (re-runs via runtime)
    Resume {
        /// Case ID (e.g. SOMA-xxxx)
        case_id: String,
    },
    /// Pipeline status and description
    Pipeline {
        #[command(subcommand)]
        command: PipelineCommand,
    },
        /// Export a Softill as a standalone tool package
    Softill {
        #[command(subcommand)]
        command: SoftillCommand,
    },
    /// Capability gap analysis and Softill proposals
    Gap {
        #[command(subcommand)]
        command: GapCommand,
    },
}

#[derive(Subcommand)]
enum PipelineCommand {
    /// Describe the pipeline stages for a given task
    Describe {
        /// Task description (e.g. "fix login bug")
        query: String,
    },
}

#[derive(Subcommand)]
enum GapCommand {
    /// Search for existing capabilities matching a query
    Search {
        /// What capability are you looking for? (e.g. "plan delivery compare")
        query: String,
    },
    /// Propose a new Softill candidate for a capability gap
    Propose {
        /// Describe the missing capability (e.g. "test impact analysis")
        query: String,
    },
}

#[derive(Subcommand)]
enum SoftillCommand {
    /// Export a softill as standalone tool (handler + manifest + test)
    Export {
        /// Softill ID (e.g. "code-search", "web-fetcher")
        softill_id: String,
        /// Output directory (defaults to current dir)
        #[arg(short, long, default_value = ".")]
        output: String,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match &cli.commands {
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
    };
    if let Err(code) = result {
        std::process::exit(code);
    }
}

/// 处理 investigate 命令：通过 Runtime 创建任务并执行 AI
async fn run_investigate(query: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    println!("🧪 正在连接 SomaOS Runtime...");

    // Phase 1: 创建任务
    let resp = client
        .send_request(
            "task/create",
            serde_json::json!({
                "project_root": ".",
                "title": query,
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            eprintln!("   请确保 soma-runtime 已编译，或运行 cargo build -p soma-runtime");
            1
        })?;

    let task_id = resp
        .result
        .as_ref()
        .and_then(|v| v["task_id"].as_str())
        .map(String::from)
        .ok_or_else(|| {
            eprintln!("❌ 创建任务失败");
            1
        })?;

    println!("🧪 任务 {} 已创建", task_id);
    println!("📋 目标：{}", query);

    // Phase 2: 发送消息（触发 AI 执行）
    let resp = client
        .send_request(
            "task/send_message",
            serde_json::json!({
                "task_id": task_id,
                "text": query,
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ {}", e);
            1
        })?;

    let turn_id = resp
        .result
        .as_ref()
        .and_then(|v| v["turn_id"].as_str())
        .map(String::from)
        .ok_or_else(|| {
            eprintln!("❌ 发送消息失败");
            1
        })?;

    println!("🚀 AI 已启动 (turn: {})", turn_id);
    println!();

    // Phase 3: 读取事件流
    loop {
        match client.read_notification().await {
            Ok(Some(notif)) => {
                if notif.method != "task/event" {
                    continue;
                }

                let params = notif.params;
                let kind = params
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                match kind {
                    "AssistantDelta" => {
                        if let Some(text) = params["payload"].get("text").and_then(|v| v.as_str()) {
                            print!("{}", text);
                        }
                    }
                    "ToolStarted" => {
                        let title = params["payload"]
                            .get("capability_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("?");
                        println!("\n⚡ {} 执行中...", title);
                    }
                    "ToolCompleted" => {
                        let success = params["payload"]
                            .get("success")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if success {
                            println!("✅ 完成");
                        } else {
                            println!("❌ 失败");
                        }
                    }
                    "TurnCompleted" => {
                        println!("\n✅ 任务完成");
                        break;
                    }
                    "TurnFailed" => {
                        let error = params["payload"]
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("未知错误");
                        eprintln!("\n❌ {}", error);
                        return Err(1);
                    }
                    _ => {}
                }
            }
            Ok(None) => {
                eprintln!("\n❌ Runtime 进程意外退出");
                return Err(1);
            }
            Err(e) => {
                eprintln!("\n❌ {}", e);
                return Err(1);
            }
        }
    }

    Ok(())
}

/// 处理 resume 命令：恢复已有 Case 的执行
async fn run_resume(case_id: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    println!("🔁 正在恢复 Case {} ...", case_id);

    let resp = client
        .send_request(
            "run/start",
            serde_json::json!({
                "case_id": case_id,
                "input": "继续调查",
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ {}", e);
            1
        })?;

    let run_id = resp
        .result
        .as_ref()
        .and_then(|v| v["run_id"].as_str())
        .map(String::from)
        .ok_or_else(|| {
            eprintln!("❌ 恢复 Case 失败");
            1
        })?;

    println!("🔁 已恢复 Case {}", case_id);
    println!("🚀 Run {} 已启动", run_id);
    println!("\n🔍 继续调查...\n");

    // 读取通知流
    loop {
        match client.read_notification().await {
            Ok(Some(notif)) => match notif.method.as_str() {
                "run.output" => {
                    if let Some(text) = notif.params.get("text").and_then(|v| v.as_str()) {
                        println!("{}", text);
                    }
                }
                "run.completed" => {
                    if let Some(outcome) = notif.params.get("outcome").and_then(|v| v.as_str()) {
                        println!("\n✅ {}", outcome);
                    }
                    break;
                }
                "run.failed" => {
                    let error = notif
                        .params
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("恢复失败");
                    eprintln!("\n❌ {}", error);
                    return Err(1);
                }
                _ => {}
            },
            Ok(None) => {
                eprintln!("❌ Runtime 进程意外退出");
                return Err(1);
            }
            Err(e) => {
                eprintln!("❌ {}", e);
                return Err(1);
            }
        }
    }

    Ok(())
}

/// 处理 gap search 命令：通过 Runtime 搜索能力缺口
async fn run_gap_search(query: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    let resp = client
        .send_request(
            "gap/search",
            serde_json::json!({ "query": query }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            1
        })?;

    match resp.result {
        Some(result) => {
            if let Some(report) = result["report"].as_str() {
                println!("{}", report);
                Ok(())
            } else {
                eprintln!("❌ Runtime 返回了意外的响应");
                Err(1)
            }
        }
        None => {
            let msg = resp.error.map(|e| e.message).unwrap_or("未知错误".to_string());
            eprintln!("❌ {}", msg);
            Err(1)
        }
    }
}

/// 处理 gap propose 命令：通过 Runtime 生成 Softill 候选提议
async fn run_gap_propose(query: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    let resp = client
        .send_request(
            "gap/propose",
            serde_json::json!({ "query": query }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            1
        })?;

    match resp.result {
        Some(result) => {
            if let Some(proposal) = result["proposal"].as_str() {
                println!("{}", proposal);
                Ok(())
            } else {
                eprintln!("❌ Runtime 返回了意外的响应");
                Err(1)
            }
        }
        None => {
            let msg = resp.error.map(|e| e.message).unwrap_or("未知错误".to_string());
            eprintln!("❌ {}", msg);
            Err(1)
        }
    }
}

/// 处理 softill export 命令：导出 Softill 为独立工具包
async fn run_softill_export(softill_id: &str, output_dir: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    let resp = client
        .send_request(
            "softill/export",
            serde_json::json!({
                "softill_id": softill_id,
                "output_dir": output_dir,
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            1
        })?;

    match resp.result {
        Some(result) => {
            if let Some(msg) = result["message"].as_str() {
                println!("✅ {}", msg);
                if let Some(dir) = result["output_dir"].as_str() {
                    println!("📁 输出目录: {}", dir);
                }
                if let Some(count) = result["file_count"].as_u64() {
                    println!("📄 生成文件数: {}", count);
                }
                Ok(())
            } else {
                eprintln!("❌ Runtime 返回了意外的响应");
                Err(1)
            }
        }
        None => {
            let msg = resp.error.map(|e| e.message).unwrap_or("未知错误".to_string());
            eprintln!("❌ {}", msg);
            Err(1)
        }
    }
}

/// 处理 pipeline describe 命令：通过 Runtime 获取管线描述
async fn run_pipeline_describe(query: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    let resp = client
        .send_request(
            "pipeline/describe",
            serde_json::json!({
                "query": query,
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            eprintln!("   请确保 soma-runtime 已编译，或运行 cargo build -p soma-runtime");
            1
        })?;

    match resp.result {
        Some(result) => {
            if let Some(description) = result["description"].as_str() {
                println!("{}", description);
                Ok(())
            } else {
                eprintln!("❌ Runtime 返回了意外的响应");
                Err(1)
            }
        }
        None => {
            let msg = resp.error.map(|e| e.message).unwrap_or("未知错误".to_string());
            eprintln!("❌ {}", msg);
            Err(1)
        }
    }
}
