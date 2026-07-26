//! # Soma — 统一 CLI + TUI 入口
//!
//! ```bash
//! soma                  # 交互式 TUI（默认）
//! soma doctor           # 系统诊断
//! soma config           # 配置管理
//! soma combo list       # 列出工作流
//! soma capability list  # 列出能力
//! soma investigate ...  # 命令行调查
//! ```

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "soma",
    version = "0.2.0",
    about = "SomaOS — AI-native work runtime",
    long_about = "SomaOS — 以能力为第一公民的工作运行时\n\
                  \n\
                  无参数启动交互式 TUI 模式。\n\
                  直接输入需求即可开始或恢复工作会话。"
)]
struct Cli {
    #[command(subcommand)]
    commands: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Investigate a problem in the current project
    Investigate { query: String },
    /// Resume a previous case
    Resume { case_id: String },
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

    // ── Gate A: Management commands ──

    /// Run system diagnostics
    Doctor,
    /// View or modify configuration
    Config,
    /// List available combos
    Combo {
        #[command(subcommand)]
        command: ComboCommand,
    },
    /// List available capabilities
    Capability {
        #[command(subcommand)]
        command: CapabilityCommand,
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
    Export {
        softill_id: String,
        #[arg(short, long, default_value = ".")]
        output: String,
    },
}

#[derive(Subcommand)]
enum ComboCommand {
    /// List all available combos
    List,
}

#[derive(Subcommand)]
enum CapabilityCommand {
    /// List all available capabilities
    List,
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
            // 有子命令 → 启动 tokio runtime 执行（管理命令不需要 runtime）
            if is_management_command(cmd) {
                return run_management(cmd);
            }
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

/// 判断是否是纯本地管理命令（不需要 Runtime 子进程）
fn is_management_command(cmd: &Commands) -> bool {
    matches!(
        cmd,
        Commands::Doctor
            | Commands::Config
            | Commands::Combo { .. }
            | Commands::Capability { .. }
    )
}

fn start_tui() -> Result<(), i32> {
    // 委托给 soma_tui::run，它内部处理 detect_workspace + runtime 子进程
    soma_tui::run().map_err(|e| {
        eprintln!("TUI error: {}", e);
        1
    })
}

/// 运行不需要 Runtime 的管理命令
fn run_management(cmd: &Commands) -> Result<(), i32> {
    match cmd {
        Commands::Doctor => run_doctor(),
        Commands::Config => run_config(),
        Commands::Combo { command } => match command {
            ComboCommand::List => run_combo_list(),
        },
        Commands::Capability { command } => match command {
            CapabilityCommand::List => run_capability_list(),
        },
        _ => unreachable!(),
    }
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
            SoftillCommand::Export { softill_id, output } => {
                run_softill_export(softill_id, output).await
            }
        },
        // Management commands handled separately
        _ => unreachable!(),
    }
}

// ── 管理命令 ─────────────────────────────────────────────────────

/// `soma doctor` — 系统诊断
fn run_doctor() -> Result<(), i32> {
    println!("🔍 SomaOS Doctor");
    println!();

    // 1. Git 可用性
    match std::process::Command::new("git")
        .arg("--version")
        .output()
    {
        Ok(out) if out.status.success() => {
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            println!("✓ Git: {}", ver);
        }
        _ => {
            println!("✗ Git: 未找到。设置 SOMA_GIT_PATH 指定路径。");
        }
    }

    // 2. Cargo / Rust
    match std::process::Command::new("cargo").arg("--version").output() {
        Ok(out) if out.status.success() => {
            println!("✓ Cargo: {}", String::from_utf8_lossy(&out.stdout).trim());
        }
        _ => {
            println!("✗ Cargo: 未找到。");
        }
    }

    // 3. 当前工作目录
    let cwd = std::env::current_dir().unwrap_or_default();
    println!("📁 CWD: {}", cwd.display());

    // 4. Git 仓库状态
    let git_dir = cwd.join(".git");
    if git_dir.is_dir() {
        println!("📦 Git repo: ✓");
    } else {
        println!("📦 Git repo: ✗（不是 git 仓库）");
    }

    // 5. 环境变量
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .or_else(|_| std::env::var("DEEPSEEK_API_KEY"))
        .map(|_| "✓ 已设置")
        .unwrap_or("✗ 未设置（需要 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY）");
    println!("🔑 API Key: {}", api_key);

    let perm_mode = std::env::var("SOMA_PERMISSION_MODE")
        .unwrap_or_else(|_| "trusted_workspace (default)".into());
    println!("🔒 权限模式: {}", perm_mode);

    Ok(())
}

/// `soma config` — 配置查看
fn run_config() -> Result<(), i32> {
    println!("📋 SomaOS 配置");
    println!();
    println!("环境变量：");
    println!("  SOMA_PERMISSION_MODE = {}",
        std::env::var("SOMA_PERMISSION_MODE").unwrap_or_else(|_| "<未设置，默认 trusted_workspace>".into()));
    println!("  SOMA_GIT_PATH        = {}",
        std::env::var("SOMA_GIT_PATH").unwrap_or_else(|_| "<未设置，自动查找 PATH>".into()));
    println!("  SOMA_NEW_SESSION     = {}",
        std::env::var("SOMA_NEW_SESSION").unwrap_or_else(|_| "<未设置，自动恢复最近会话>".into()));
    println!();
    println!("说明：SomaOS 当前使用环境变量配置。");
    println!("运行 `soma doctor` 查看完整诊断信息。");
    Ok(())
}

/// `soma combo list` — 列出可用工作流
fn run_combo_list() -> Result<(), i32> {
    println!("📋 可用 Combo（工作流）：");
    println!();
    let combos = [
        ("investigate", "调查代码问题"),
        ("spec", "编写规范文档"),
        ("plan", "制定实现计划"),
        ("review", "审查代码改动"),
        ("plan-review", "审查实施计划"),
        ("qa", "质量检查"),
        ("routing", "路由分析"),
        ("registry", "能力注册"),
        ("pipeline", "流水线处理"),
        ("office-hours", "工作时间设定"),
        ("takeover", "任务接管"),
        ("softill", "Softill 导出"),
        ("softill-library", "Softill 库管理"),
        ("softill-export", "Softill 导出工具"),
        ("ship", "创建 PR"),
        ("figma", "Figma 集成"),
        ("combo-registry", "Combo 注册"),
        ("task", "任务管理"),
        ("work-state", "工作状态管理"),
        ("capability-searcher", "能力搜索"),
        ("pipeline-display", "流水线显示"),
        ("common-plugins", "通用插件"),
    ];
    for (name, desc) in &combos {
        println!("  {:<25} {}", name, desc);
    }
    println!();
    println!("使用 \"soma investigate <问题>\" 启动调查。");
    Ok(())
}

/// `soma capability list` — 列出可用能力
fn run_capability_list() -> Result<(), i32> {
    println!("📋 可用 Capability（能力）：");
    println!();
    let caps = [
        ("file_read", "读取文件内容"),
        ("file_search", "搜索文件和代码"),
        ("file_edit", "修改文件"),
        ("file_write", "写入文件"),
        ("process_run", "执行命令"),
        ("git_status", "检查 Git 状态"),
        ("git_diff", "查看文件差异"),
        ("git_log", "查看提交历史"),
    ];
    for (name, desc) in &caps {
        println!("  {:<25} {}", name, desc);
    }
    println!();
    println!("能力通过 Organ trait 契约执行，经过 Permission 策略过滤。");
    Ok(())
}

// ── 原有子命令处理 ──────────────────────────────────────────────

async fn run_investigate(query: &str) -> Result<(), i32> {
    use soma_client::SomaClient;

    let client = SomaClient::connect(".").await.map_err(|e| {
        eprintln!("Failed to connect: {}", e);
        1
    })?;

    let mut rx = client.subscribe_events();

    println!("📋 {}", query);
    client.send_message(query).await.map_err(|e| {
        eprintln!("Failed to send: {}", e);
        1
    })?;

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
                let name = envelope
                    .payload
                    .get("capability_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                println!("\n[Tool: {}]", name);
            }
            soma_protocol::events::RuntimeEventKind::ToolCompleted => {
                let ok = envelope
                    .payload
                    .get("success")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                println!(" -> {}", if ok { "OK" } else { "FAIL" });
            }
            soma_protocol::events::RuntimeEventKind::TurnCompleted => {
                println!("\nDone");
                break;
            }
            soma_protocol::events::RuntimeEventKind::TurnFailed => {
                let err = envelope
                    .payload
                    .get("error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
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
