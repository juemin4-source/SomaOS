//! SomaOS Runtime — JSON-RPC over stdio
//!
//! Usage: soma-runtime --stdio
//!
//! Reads JSON-RPC 2.0 Request objects (one per line) from stdin,
//! writes Response and Notification objects (one per line) to stdout.
//!
//! Methods:
//!   case/create   — create a new Case, return case_id
//!   case/get      — get Case info from store
//!   run/start     — create & start a Run, return run_id (async)
//!   run/get       — get Run status from store
//!   run/cancel    — cancel a Run
//!
//! Notifications (for active runs):
//!   run.started / run.output / run.yielded / run.completed / run.failed

use std::io::{self, BufRead, Write, BufWriter};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use soma_capability::contract::{CapabilityContract, EffectClass, Reversibility};
use soma_capability::organ::{FileOrgan, GitOrgan, ProcessOrgan};
use soma_capability::registry::CapabilityRegistry;
use soma_core::engine::turn_engine::TurnEngine;
use soma_core::policy;
use soma_core::policy::PolicyDecision;
use soma_core::port::model_provider::ModelProvider;
use soma_core::run::Run;
use soma_store::run_store::{RunRecord, RunStore, RunStatus as StoreRunStatus};
use soma_store::sqlite::SqliteCaseStore;
use soma_store::store::CaseStore;
use soma_protocol::command::{Request, Response, ProtocolError, Notification};
use soma_protocol::params::{
    CaseCreateParams, CaseCreateResult,
    CaseGetParams, CaseGetResult,
    RunStartParams, RunStartResult,
    RunGetParams, RunCancelParams, RunCancelResult,
    RunStatus as ProtoRunStatus,
};

const STDIO_FLAG: &str = "--stdio";
const STORE_PATH: &str = ".somaos/cases.db";

// ── Shared state ──

struct AppState {
    store: Arc<SqliteCaseStore>,
    registry: Arc<CapabilityRegistry>,
    /// 活跃 Run 的取消标志
    active_runs: Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>,
}

// ── Output writer (shared between main loop and async run tasks) ──

struct OutputWriter {
    inner: Mutex<BufWriter<io::Stdout>>,
}

impl OutputWriter {
    fn new() -> Self {
        Self {
            inner: Mutex::new(BufWriter::new(io::stdout())),
        }
    }

    fn write_response(&self, resp: &Response) {
        let json = match serde_json::to_string(resp) {
            Ok(j) => j,
            Err(e) => {
                eprintln!("[runtime] serialize response error: {}", e);
                return;
            }
        };
        let mut w = self.inner.lock().unwrap();
        let _ = writeln!(w, "{}", json);
        let _ = w.flush();
    }

    fn write_notification(&self, method: &str, params: &serde_json::Value) {
        let notif = Notification {
            jsonrpc: "2.0".into(),
            method: method.into(),
            params: params.clone(),
        };
        let json = match serde_json::to_string(&notif) {
            Ok(j) => j,
            Err(e) => {
                eprintln!("[runtime] serialize notification error: {}", e);
                return;
            }
        };
        let mut w = self.inner.lock().unwrap();
        let _ = writeln!(w, "{}", json);
        let _ = w.flush();
    }

    fn write_error(&self, id: u64, code: i32, message: &str) {
        self.write_response(&Response {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(ProtocolError {
                code,
                message: message.into(),
                data: None,
            }),
        });
    }
}

// ── Capability registry builder ──

fn build_registry(repo_root: PathBuf) -> CapabilityRegistry {
    let mut registry = CapabilityRegistry::new();

    let file_organ = Arc::new(FileOrgan::new(repo_root.clone())) as Arc<dyn soma_capability::organ::Organ>;
    registry.register_arc(
        CapabilityContract::basic(
            "file_read",
            "读取文件内容",
            EffectClass::ReadOnly,
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "read"},
                    "path": {"type": "string", "description": "文件路径（相对或绝对，必须在 repo 内）"}
                },
                "required": ["action", "path"]
            }),
        ),
        file_organ.clone(),
    );
    registry.register_arc(
        CapabilityContract::basic(
            "file_search",
            "在文件中搜索文本模式",
            EffectClass::ReadOnly,
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "search"},
                    "pattern": {"type": "string", "description": "搜索关键词"},
                    "path": {"type": "string", "description": "文件名过滤（可选）"}
                },
                "required": ["action", "pattern"]
            }),
        ),
        file_organ,
    );

    let process_organ = Arc::new(ProcessOrgan::new(repo_root.clone())) as Arc<dyn soma_capability::organ::Organ>;
    let mut p_contract = CapabilityContract::basic(
        "process_run",
        "运行白名单 shell 命令（ls/cat/grep/cargo/git 等）",
        EffectClass::WriteLocal,
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "要执行的命令"},
                "timeout": {"type": "integer", "description": "超时秒数（默认 30）"}
            },
            "required": ["command"]
        }),
    );
    p_contract.reversibility = Reversibility::ConditionalReversibility;
    registry.register_arc(p_contract, process_organ);

    let git_organ = Arc::new(GitOrgan::new(repo_root)) as Arc<dyn soma_capability::organ::Organ>;
    for entry in [
        ("git_status", "查看 git 仓库状态（dirty 文件、暂存区）", serde_json::json!({
            "type": "object",
            "properties": {"action": {"const": "status"}},
            "required": ["action"]
        })),
        ("git_diff", "查看 git diff（工作树与 HEAD 的差异）", serde_json::json!({
            "type": "object",
            "properties": {
                "action": {"const": "diff"},
                "path": {"type": "string", "description": "指定文件路径（可选）"}
            },
            "required": ["action"]
        })),
        ("git_log", "查看 git 提交日志", serde_json::json!({
            "type": "object",
            "properties": {
                "action": {"const": "log"},
                "max_count": {"type": "integer", "description": "最大提交数（默认 10）"}
            },
            "required": ["action"]
        })),
    ] {
        registry.register_arc(
            CapabilityContract::basic(entry.0, entry.1, EffectClass::ReadOnly, entry.2),
            git_organ.clone(),
        );
    }
    registry
}

// ── Model provider factory ──

fn build_provider() -> Option<Box<dyn ModelProvider + Send + Sync>> {
    if let Ok(p) = soma_model_rig::deepseek::DeepSeekProvider::from_env() {
        Some(Box::new(p))
    } else if let Ok(p) = soma_model_rig::RigClaudeProvider::from_env() {
        Some(Box::new(p))
    } else {
        None
    }
}

// ── Execute capability ──

async fn execute_capability(
    engine: &mut TurnEngine,
    registry: &CapabilityRegistry,
    name: &str,
    arguments: serde_json::Value,
) -> String {
    engine.record_action_started(name, &arguments);
    match registry.execute(name, arguments).await {
        Ok(result) => {
            let formatted = serde_json::to_string_pretty(&result).unwrap_or_default();
            let hash = &formatted[..formatted.len().min(32)];
            engine.record_action_committed(name, hash);
            let evidence_type = match name {
                n if n.starts_with("file_") || n.starts_with("git_") => "Observation",
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
            engine.record_evidence(
                &format!("EV-{}-failed", name),
                "Observation",
                &format!("{} failed", name),
                Some(name),
            );
            msg
        }
    }
}

// ── Policy decision for a tool call (runtime: no interactive user) ──

fn decide_capability(name: &str, arguments: &serde_json::Value, registry: &CapabilityRegistry) -> PolicyDecision {
    let contract = match registry.contract(name) {
        None => return PolicyDecision::Deny(format!("未知能力: {}", name)),
        Some(c) => c,
    };
    match contract.effect_class {
        EffectClass::ReadOnly => PolicyDecision::Allow,
        EffectClass::WriteLocal => {
            if contract.capability_id == "process_run" {
                let cmd = arguments.get("command").and_then(|v| v.as_str()).unwrap_or("");
                match policy::classify_command(cmd) {
                    policy::CommandRisk::Safe => PolicyDecision::Allow,
                    policy::CommandRisk::Warning { description } => {
                        PolicyDecision::Deny(format!("⚠️ {} — {}（需用户授权）", description, cmd))
                    }
                    policy::CommandRisk::Forbidden { description } => PolicyDecision::Deny(format!("🚫 {}", description)),
                }
            } else {
                PolicyDecision::Deny(format!("需要用户授权写入操作: {}", contract.description))
            }
        }
        EffectClass::WriteGlobal => PolicyDecision::Deny("全局写入操作暂不支持".into()),
        EffectClass::SideEffect => PolicyDecision::Deny(format!("需要用户授权副作用操作: {}", contract.description)),
    }
}

// ── Async run task ──

/// 执行结果：成功或失败原因
#[derive(Debug)]
enum RunResult {
    Completed(String),
    Failed(String),
}

async fn run_turn_engine(
    run_id: String,
    case_id: String,
    input: String,
    store: Arc<SqliteCaseStore>,
    registry: Arc<CapabilityRegistry>,
    output: Arc<OutputWriter>,
    cancel_flag: Arc<AtomicBool>,
) -> RunResult {
    // 标记 RUNNING
    let _ = store.update_run_status(&run_id, StoreRunStatus::Running, None, None);
    output.write_notification("run.started", &serde_json::json!({
        "case_id": case_id,
        "run_id": run_id,
    }));

    // 构建 Model Provider
    let provider = match build_provider() {
        Some(p) => p,
        None => {
            let msg = "无可用模型 Provider（设 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY）".to_string();
            let _ = store.update_run_status(&run_id, StoreRunStatus::Failed, Some(&chrono::Utc::now().to_rfc3339()), Some(&msg));
            output.write_notification("run.failed", &serde_json::json!({
                "case_id": case_id, "run_id": run_id, "error": msg,
            }));
            return RunResult::Failed(msg);
        }
    };

    // 通知；run.output（模型开始思考前的初始消息）
    output.write_notification("run.output", &serde_json::json!({
        "case_id": case_id, "run_id": run_id, "sequence": 0,
        "text": format!("🧠 开始调查: {}", input),
    }));

    // 构建 TurnEngine
    let case_store: Arc<dyn CaseStore> = store.clone();
    let mut engine = TurnEngine::with_store(provider, case_id.clone(), Some(case_store));
    let tools = registry.tool_definitions();
    engine.start(&input, tools);

    // ── 第一轮模型请求 ──
    let (text, tool_call) = match engine.request_model().await {
        Ok(result) => result,
        Err(e) => {
            return fail_run(&run_id, &case_id, &store, &output, &e).await;
        }
    };

    if cancel_flag.load(Ordering::SeqCst) {
        return handle_cancel(&run_id, &case_id, &store, &output).await;
    }

    match tool_call {
        Some(tc) => {
            // 模型要求使用工具
            output.write_notification("run.output", &serde_json::json!({
                "case_id": case_id, "run_id": run_id, "sequence": 1,
                "text": text,
            }));

            // 判断政策
            let decision = decide_capability(&tc.name, &tc.arguments, &registry);
            engine.record_policy_evaluated(&tc.name, &format!("{:?}", &decision), "effect_class");

            let obs = match &decision {
                PolicyDecision::Allow => {
                    execute_capability(&mut engine, &registry, &tc.name, tc.arguments.clone()).await
                }
                PolicyDecision::Deny(reason) => {
                    engine.record_permission_denied(&tc.name, reason);
                    format!("请求被拒绝: {}", reason)
                }
                PolicyDecision::NeedsOwner { reason } => {
                    // Runtime 没有交互用户，拒绝
                    engine.record_permission_denied(&tc.name, reason);
                    format!("需要用户授权（runtime 自动拒绝）: {}", reason)
                }
            };

            output.write_notification("run.output", &serde_json::json!({
                "case_id": case_id, "run_id": run_id, "sequence": 2,
                "text": format!("⚡ {} 执行结果: {}", tc.name, obs),
            }));

            // 提供观察结果，继续
            let _ = engine.provide_observation(&obs);

            if cancel_flag.load(Ordering::SeqCst) {
                return handle_cancel(&run_id, &case_id, &store, &output).await;
            }

            // 第二轮模型请求
            match engine.continue_turn().await {
                Ok((cont_text, _)) => {
                    engine.finish(&cont_text);
                    let outcome = format!("✅ 模型结论: {}", cont_text);
                    let _ = store.update_run_status(
                        &run_id, StoreRunStatus::Completed,
                        Some(&chrono::Utc::now().to_rfc3339()),
                        Some(&outcome),
                    );
                    output.write_notification("run.output", &serde_json::json!({
                        "case_id": case_id, "run_id": run_id, "sequence": 3,
                        "text": cont_text,
                    }));
                    output.write_notification("run.completed", &serde_json::json!({
                        "case_id": case_id, "run_id": run_id, "outcome": outcome,
                    }));
                    RunResult::Completed(outcome)
                }
                Err(e) => {
                    fail_run(&run_id, &case_id, &store, &output, &e).await
                }
            }
        }
        None => {
            // 模型直接给出结论
            engine.finish(&text);
            let _ = store.update_run_status(
                &run_id, StoreRunStatus::Completed,
                Some(&chrono::Utc::now().to_rfc3339()),
                Some(&text),
            );
            output.write_notification("run.output", &serde_json::json!({
                "case_id": case_id, "run_id": run_id, "sequence": 1,
                "text": text,
            }));
            output.write_notification("run.completed", &serde_json::json!({
                "case_id": case_id, "run_id": run_id, "outcome": text,
            }));
            RunResult::Completed(text)
        }
    }
}

async fn fail_run(run_id: &str, case_id: &str, store: &Arc<SqliteCaseStore>, output: &Arc<OutputWriter>, error: &str) -> RunResult {
    let _ = store.update_run_status(run_id, StoreRunStatus::Failed, Some(&chrono::Utc::now().to_rfc3339()), Some(error));
    output.write_notification("run.failed", &serde_json::json!({
        "case_id": case_id, "run_id": run_id, "error": error,
    }));
    RunResult::Failed(error.to_string())
}

async fn handle_cancel(run_id: &str, case_id: &str, store: &Arc<SqliteCaseStore>, output: &Arc<OutputWriter>) -> RunResult {
    let _ = store.update_run_status(
        run_id, StoreRunStatus::Cancelled,
        Some(&chrono::Utc::now().to_rfc3339()),
        Some("用户取消"),
    );
    output.write_notification("run.cancelled", &serde_json::json!({
        "case_id": case_id, "run_id": run_id,
    }));
    RunResult::Failed("用户取消".to_string())
}

// ── Request handlers ──

fn handle_case_create(params: serde_json::Value, store: &Arc<SqliteCaseStore>) -> Result<serde_json::Value, String> {
    let p: CaseCreateParams = serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    let case_id = format!("SOMA-{}", &uuid::Uuid::new_v4().to_string()[..8]);

    // 记录创建事件到 store
    let case_store: Arc<dyn CaseStore> = store.clone();
    let event = soma_store::store::CaseEvent {
        case_id: case_id.clone(),
        event_type: "case.created".into(),
        payload: serde_json::json!({
            "title": p.title,
            "initial_query": p.initial_query,
            "created_at": chrono::Utc::now().to_rfc3339(),
        }),
        version: 1,
    };
    case_store.append(&case_id, &event).map_err(|e| format!("store error: {}", e))?;

    let result = CaseCreateResult { case_id };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

fn handle_case_get(params: serde_json::Value, store: &Arc<SqliteCaseStore>) -> Result<serde_json::Value, String> {
    let p: CaseGetParams = serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    let case_store: Arc<dyn CaseStore> = store.clone();
    let events = case_store.replay(&p.case_id).map_err(|e| format!("store error: {}", e))?;

    let result = CaseGetResult {
        case_id: p.case_id,
        title: "".into(),      // 从事件中提取需要解析事件，暂略
        status: if events.is_empty() { "unknown" } else { "active" }.into(),
        event_count: events.len() as u64,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

fn handle_run_start(
    params: serde_json::Value,
    state: &Arc<AppState>,
    output: &Arc<OutputWriter>,
    runtime_case_store: Arc<SqliteCaseStore>,
) -> Result<serde_json::Value, String> {
    let p: RunStartParams = serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    // 创建 Run 实体
    let core_run = Run::new(&p.case_id, "cli");
    let run_id = core_run.run_id.clone();

    // 持久化 Run
    let record = RunRecord {
        run_id: core_run.run_id,
        case_id: core_run.case_id.clone(),
        submitted_by: core_run.submitted_by.clone(),
        status: StoreRunStatus::Accepted,
        started_at: core_run.started_at.clone(),
        finished_at: None,
        outcome: None,
    };
    state.store.insert_run(&record).map_err(|e| format!("store error: {}", e))?;

    // 设置取消标志
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state.active_runs.lock().unwrap().insert(run_id.clone(), cancel_flag.clone());

    // 启动异步 run 任务
    let store_clone = runtime_case_store.clone();
    let registry_clone = state.registry.clone();
    let output_clone = output.clone();
    let task_case_id = p.case_id.clone();
    let task_run_id = run_id.clone();
    let task_input = p.input.clone();

    tokio::spawn(async move {
        let result = run_turn_engine(
            task_run_id.clone(),
            task_case_id.clone(),
            task_input,
            store_clone.clone(),
            registry_clone,
            output_clone.clone(),
            cancel_flag,
        ).await;

        match &result {
            RunResult::Completed(outcome) => {
                tracing::info!(run_id = %task_run_id, outcome = %outcome, "Run completed");
            }
            RunResult::Failed(error) => {
                tracing::warn!(run_id = %task_run_id, error = %error, "Run failed");
            }
        }
    });

    let result = RunStartResult {
        run_id,
        case_id: p.case_id,
        status: ProtoRunStatus::Accepted,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

fn handle_run_get(params: serde_json::Value, store: &Arc<SqliteCaseStore>) -> Result<serde_json::Value, String> {
    let p: RunGetParams = serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    match store.get_run(&p.run_id).map_err(|e| format!("store error: {}", e))? {
        Some(record) => {
            let result = soma_protocol::params::RunStatusResult {
                run_id: record.run_id,
                case_id: record.case_id,
                status: serde_json::from_value(serde_json::json!(record.status))
                    .map_err(|e| format!("status conversion: {}", e))?,
                started_at: record.started_at,
                finished_at: record.finished_at,
                outcome: record.outcome,
            };
            serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
        }
        None => Err(format!("run not found: {}", p.run_id)),
    }
}

fn handle_run_cancel(params: serde_json::Value, state: &Arc<AppState>) -> Result<serde_json::Value, String> {
    let p: RunCancelParams = serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    // 设置取消标志
    if let Some(flag) = state.active_runs.lock().unwrap().get(&p.run_id) {
        flag.store(true, Ordering::SeqCst);
    }

    let _ = state.store.update_run_status(
        &p.run_id, StoreRunStatus::Cancelled,
        Some(&chrono::Utc::now().to_rfc3339()),
        Some("用户取消"),
    );

    let result = RunCancelResult {
        run_id: p.run_id,
        status: ProtoRunStatus::Cancelled,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

// ── Pipeline Handlers ──

fn handle_pipeline_describe(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = params.get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'query' field".to_string())?;

    let description = soma_core::combo::pipeline_display::render_describe(query);
    let result = soma_protocol::params::PipelineDescribeResult { description };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

// ── Main ──

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 || args[1] != STDIO_FLAG {
        eprintln!("Usage: soma-runtime --stdio");
        std::process::exit(1);
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();

    let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
    rt.block_on(async_main());
}

async fn async_main() {
    // 初始化 Store
    let repo_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let store_path = repo_root.join(STORE_PATH);
    if let Some(parent) = store_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let store = match SqliteCaseStore::new(store_path.to_str().unwrap()) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            eprintln!("[runtime] 无法打开存储: {}", e);
            std::process::exit(1);
        }
    };

    // 构建能力注册表
    let registry = Arc::new(build_registry(repo_root));

    // 检查 Provider
    if build_provider().is_none() {
        eprintln!("[runtime] 警告: 未配置模型 Provider（设 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY）");
        // 不退出——允许只做 case/create + run/get 等操作
    }

    let state = Arc::new(AppState {
        store: store.clone(),
        registry,
        active_runs: Mutex::new(std::collections::HashMap::new()),
    });

    let output = Arc::new(OutputWriter::new());

    // 主循环：逐行读取 stdin
    let stdin = io::stdin();
    let reader = stdin.lock();
    let mut line_buf = String::new();
    let mut reader = io::BufReader::new(reader);

    loop {
        line_buf.clear();
        match reader.read_line(&mut line_buf) {
            Ok(0) => break,  // EOF
            Ok(_) => {}
            Err(e) => {
                eprintln!("[runtime] stdin error: {}", e);
                break;
            }
        }

        let line = line_buf.trim();
        if line.is_empty() {
            continue;
        }

        let request: Request = match serde_json::from_str(line) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[runtime] parse error: {} (line: {})", e, line);
                // 无法解析时无法返回错误——没有 id
                continue;
            }
        };

        let id = request.id;
        let result = match request.method.as_str() {
            "case/create" => handle_case_create(request.params, &state.store),
            "case/get" => handle_case_get(request.params, &state.store),
            "run/start" => handle_run_start(request.params, &state, &output, store.clone()),
            "run/get" => handle_run_get(request.params, &state.store),
            "run/cancel" => handle_run_cancel(request.params, &state),
            "pipeline/describe" => handle_pipeline_describe(request.params),
            _ => Err(format!("unknown method: {}", request.method)),
        };

        match result {
            Ok(value) => output.write_response(&Response {
                jsonrpc: "2.0".into(),
                id,
                result: Some(value),
                error: None,
            }),
            Err(e) => output.write_error(id, -32601, &e),
        }
    }

    // 清理：取消所有活跃 Run
    {
        let runs = state.active_runs.lock().unwrap();
        for (_, flag) in runs.iter() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    eprintln!("[runtime] 退出");
}
