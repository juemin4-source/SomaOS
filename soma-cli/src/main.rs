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
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let result = match &cli.commands {
        Commands::Investigate { query } => run_investigate(query).await,
        Commands::Resume { case_id } => run_resume(case_id).await,
    };
    if let Err(code) = result {
        std::process::exit(code);
    }
}

/// 处理 investigate 命令：通过 Runtime 创建 Case 并异步执行
async fn run_investigate(query: &str) -> Result<(), i32> {
    let mut client = StdioClient::new();

    // Phase 1: 创建 Case
    println!("🧪 正在连接 SomaOS Runtime...");

    let resp = client
        .send_request(
            "case/create",
            serde_json::json!({
                "title": query,
                "initial_query": query,
            }),
        )
        .await
        .map_err(|e| {
            eprintln!("❌ 无法连接 Runtime: {}", e);
            eprintln!("   请确保 soma-runtime 已编译，或运行 cargo build -p soma-runtime");
            1
        })?;

    let case_id = resp
        .result
        .as_ref()
        .and_then(|v| v["case_id"].as_str())
        .map(String::from)
        .ok_or_else(|| {
            let err_msg = resp
                .error
                .as_ref()
                .map(|e| e.message.as_str())
                .unwrap_or("未知错误");
            eprintln!("❌ 创建 Case 失败: {}", err_msg);
            1
        })?;

    println!("🧪 Case {} 已创建", case_id);
    println!("📋 目标：{}", query);

    // Phase 2: 启动 Run
    let resp = client
        .send_request(
            "run/start",
            serde_json::json!({
                "case_id": case_id,
                "input": query,
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
            eprintln!("❌ 启动 Run 失败");
            1
        })?;

    println!("🚀 Run {} 已启动", run_id);
    println!("\n🔍 正在调查...\n");

    // Phase 3: 读取通知流
    loop {
        match client.read_notification().await {
            Ok(Some(notif)) => match notif.method.as_str() {
                "run.started" => {
                    // 可选：显示开始信息
                }
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
                        .unwrap_or("调查失败");
                    eprintln!("\n❌ {}", error);
                    return Err(1);
                }
                "run.cancelled" => {
                    println!("\n❌ 已取消");
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
