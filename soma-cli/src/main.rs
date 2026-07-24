use clap::{Parser, Subcommand};
use std::path::PathBuf;
use soma_capability::contract::{CapabilityContract, EffectClass, Reversibility};
use soma_capability::organ::{FileOrgan, GitOrgan, ProcessOrgan};
use soma_capability::registry::CapabilityRegistry;
use soma_core::policy::{self, PolicyDecision};

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
    /// Resume a previous case from storage
    Resume {
        /// Case ID (e.g. SOMA-0001)
        case_id: String,
        /// Model override (optional)
        #[arg(long)]
        model: Option<String>,
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
        Commands::Resume { case_id, model: _ } => resume(case_id).await,
    }
}

async fn resume(case_id: &str) {
    let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    // 从 store 恢复
    let provider = match soma_model_rig::RigClaudeProvider::from_env() {
        Ok(p) => Box::new(p) as Box<dyn soma_core::port::model_provider::ModelProvider + Send + Sync>,
        Err(e) => {
            println!("❌ 无法连接模型: {}", e);
            return;
        }
    };

    let store_path = ".somaos/cases.db";
    let store = match soma_store::sqlite::SqliteCaseStore::new(store_path) {
        Ok(s) => std::sync::Arc::new(s) as std::sync::Arc<dyn soma_store::store::CaseStore>,
        Err(e) => {
            println!("❌ 无法打开存储: {}", e);
            return;
        }
    };

    let mut engine = match soma_core::engine::turn_engine::TurnEngine::resume(provider, case_id, store) {
        Ok(e) => e,
        Err(e) => {
            println!("❌ 恢复失败: {}", e);
            return;
        }
    };

    println!("🔁 已恢复 Case {}", case_id);
    println!("   事件数: {}", engine.events().len());

    // 重建 registry 并继续
    let registry = build_registry(repo_root);
    let tools = registry.tool_definitions();
    println!("🔧 {} 个能力就绪", tools.len());

    // 从上次中断处继续
    engine.start("继续调查", tools);
    run_turn(&mut engine, &registry).await;
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

    let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let case_id = format!("SOMA-{:04}", 1u32);
    println!("🧪 Case {} 已创建", case_id);
    println!("📋 目标：{}", query);

    let registry = build_registry(repo_root);
    let tools = registry.tool_definitions();
    println!("🔧 已注册 {} 个能力", tools.len());

    let mut engine = soma_core::engine::turn_engine::TurnEngine::new(provider, case_id);
    engine.start(query, tools);
    run_turn(&mut engine, &registry).await;
}

fn build_registry(repo_root: PathBuf) -> CapabilityRegistry {
    let mut registry = CapabilityRegistry::new();

    let file_organ = std::sync::Arc::new(FileOrgan::new(repo_root.clone())) as std::sync::Arc<dyn soma_capability::organ::Organ>;
    registry.register_arc(
        CapabilityContract {
            capability_id: "file.read".into(),
            description: "读取文件内容".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "read"},
                    "path": {"type": "string", "description": "文件路径（相对或绝对，必须在 repo 内）"}
                },
                "required": ["action", "path"]
            }),
            output_schema: serde_json::json!({}),
            effect_class: EffectClass::ReadOnly,
            reversibility: Reversibility::Reversible,
        },
        file_organ.clone(),
    );
    registry.register_arc(
        CapabilityContract {
            capability_id: "file.search".into(),
            description: "在文件中搜索文本模式".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "search"},
                    "pattern": {"type": "string", "description": "搜索关键词"},
                    "path": {"type": "string", "description": "文件名过滤（可选）"}
                },
                "required": ["action", "pattern"]
            }),
            output_schema: serde_json::json!({}),
            effect_class: EffectClass::ReadOnly,
            reversibility: Reversibility::Reversible,
        },
        file_organ,
    );

    let process_organ = std::sync::Arc::new(ProcessOrgan::new(repo_root.clone())) as std::sync::Arc<dyn soma_capability::organ::Organ>;
    registry.register_arc(
        CapabilityContract {
            capability_id: "process.run".into(),
            description: "运行白名单 shell 命令（ls/cat/grep/cargo/git 等）".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "要执行的命令"},
                    "timeout": {"type": "integer", "description": "超时秒数（默认 30）"}
                },
                "required": ["command"]
            }),
            output_schema: serde_json::json!({}),
            effect_class: EffectClass::WriteLocal,
            reversibility: Reversibility::ConditionalReversibility,
        },
        process_organ,
    );

    let git_organ = std::sync::Arc::new(GitOrgan::new(repo_root)) as std::sync::Arc<dyn soma_capability::organ::Organ>;
    for (cap_id, desc, input_schema) in [
        ("git.status", "查看 git 仓库状态（dirty 文件、暂存区）", serde_json::json!({
            "type": "object",
            "properties": {"action": {"const": "status"}},
            "required": ["action"]
        })),
        ("git.diff", "查看 git diff（工作树与 HEAD 的差异）", serde_json::json!({
            "type": "object",
            "properties": {
                "action": {"const": "diff"},
                "path": {"type": "string", "description": "指定文件路径（可选）"}
            },
            "required": ["action"]
        })),
        ("git.log", "查看 git 提交日志", serde_json::json!({
            "type": "object",
            "properties": {
                "action": {"const": "log"},
                "max_count": {"type": "integer", "description": "最大提交数（默认 10）"}
            },
            "required": ["action"]
        })),
    ] {
        registry.register_arc(
            CapabilityContract {
                capability_id: cap_id.into(),
                description: desc.into(),
                input_schema,
                output_schema: serde_json::json!({}),
                effect_class: EffectClass::ReadOnly,
                reversibility: Reversibility::Reversible,
            },
            git_organ.clone(),
        );
    }
    registry
}

async fn run_turn(engine: &mut soma_core::engine::turn_engine::TurnEngine, registry: &CapabilityRegistry) {
    println!("\n🔍 正在调查...\n");

    match engine.request_model().await {
        Ok((text, Some(tc))) => {
            tracing::info!(text_len = text.len(), tool = %tc.name, "model requested tool");

            println!("  模型思考: {}", text);
            println!();
            println!("⚡ 请求能力：「{}」", tc.name);
            println!("   参数: {}", serde_json::to_string_pretty(&tc.arguments).unwrap());
            println!();

            let contract = registry.contract(&tc.name);
            let decision = match contract {
                None => PolicyDecision::Deny(format!("未知能力: {}", tc.name)),
                Some(c) => match c.effect_class {
                    EffectClass::ReadOnly => PolicyDecision::Allow,
                    EffectClass::WriteLocal => {
                        if c.capability_id == "process.run" {
                            let cmd = tc.arguments.get("command").and_then(|v| v.as_str()).unwrap_or("");
                            match policy::classify_command(cmd) {
                                policy::CommandRisk::Safe => PolicyDecision::Allow,
                                policy::CommandRisk::Warning { description } => PolicyDecision::NeedsOwner {
                                    reason: format!("⚠️ {} — {}", description, cmd),
                                },
                                policy::CommandRisk::Forbidden { description } => PolicyDecision::Deny(format!("🚫 {}", description)),
                            }
                        } else {
                            PolicyDecision::NeedsOwner { reason: format!("需要授权写入操作: {}", c.description) }
                        }
                    }
                    EffectClass::WriteGlobal => PolicyDecision::Deny("全局写入操作暂不支持".into()),
                    EffectClass::SideEffect => PolicyDecision::NeedsOwner { reason: format!("需要授权副作用操作: {}", c.description) },
                },
            };

            engine.record_policy_evaluated(&tc.name, &format!("{:?}", &decision), "effect_class");

            let obs = match &decision {
                PolicyDecision::Allow => {
                    println!("✅ 政策允许 — 自动执行");
                    execute_capability(engine, registry, &tc.name, tc.arguments.clone()).await
                }
                PolicyDecision::Deny(reason) => {
                    println!("🚫 政策拒绝: {}", reason);
                    engine.record_permission_denied(&tc.name, reason);
                    format!("请求被拒绝: {}", reason)
                }
                PolicyDecision::NeedsOwner { reason } => {
                    println!("🔐 {}", reason);
                    print!("  是否授权？[Y/n] ");
                    std::io::Write::flush(&mut std::io::stdout()).unwrap_or(());
                    let mut input = String::new();
                    std::io::stdin().read_line(&mut input).unwrap_or(0);
                    if input.trim().to_lowercase() == "n" {
                        let msg = "用户拒绝了请求";
                        engine.record_permission_denied(&tc.name, msg);
                        println!("  {}", msg);
                        msg.to_string()
                    } else {
                        engine.record_permission_granted(&tc.name, "owner");
                        execute_capability(engine, registry, &tc.name, tc.arguments.clone()).await
                    }
                }
            };

            engine.provide_observation(&obs).unwrap();
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

/// 执行能力并记录 ActionTrace + Evidence 事件
async fn execute_capability(
    engine: &mut soma_core::engine::turn_engine::TurnEngine,
    registry: &soma_capability::registry::CapabilityRegistry,
    name: &str,
    arguments: serde_json::Value,
) -> String {
    engine.record_action_started(name, &arguments);
    match registry.execute(name, arguments).await {
        Ok(result) => {
            let formatted = serde_json::to_string_pretty(&result).unwrap_or_default();
            println!("  执行结果: {}", formatted);
            let hash = &formatted[..formatted.len().min(32)];
            engine.record_action_committed(name, hash);
            // M3: 记录 Observation Evidence
            let evidence_type = match name {
                n if n.starts_with("file.") || n.starts_with("git.") => "Observation",
                _ => "Change",
            };
            engine.record_evidence(
                &format!("EV-{}-{}", name, &hash[..8]),
                evidence_type,
                &format!("{} result", name),
                Some(name),
            );
            formatted
        }
        Err(e) => {
            let msg = format!("执行失败: {}", e);
            engine.record_action_failed(name, &msg);
            // M3: 记录 Observation Evidence（失败）
            engine.record_evidence(
                &format!("EV-{}-failed", name),
                "Observation",
                &format!("{} failed", name),
                Some(name),
            );
            eprintln!("  {}", msg);
            msg
        }
    }
}
