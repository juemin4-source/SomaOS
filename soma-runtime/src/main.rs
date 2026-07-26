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

use std::io::{self, BufRead, BufWriter, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use soma_capability::contract::{CapabilityContract, EffectClass, Reversibility};
use soma_capability::organ::{FileOrgan, GitOrgan, ProcessOrgan};
use soma_capability::registry::CapabilityRegistry;
use soma_core::engine::turn_engine::TurnEngine;
use soma_core::policy;
use soma_core::policy::PolicyDecision;
use soma_core::port::model_provider::ModelProvider;
use soma_core::run::Run;
use soma_protocol::command::{Notification, ProtocolError, Request, Response};
use soma_protocol::events::EventSink;
use soma_store::run_store::{RunRecord, RunStatus as StoreRunStatus, RunStore};
use soma_store::sqlite::SqliteCaseStore;
use soma_store::store::CaseStore;

mod event_adapter;
mod http_server;
mod task_manager;
use soma_protocol::params::{
    CaseCreateParams, CaseCreateResult, CaseGetParams, CaseGetResult, RunCancelParams,
    RunCancelResult, RunGetParams, RunStartParams, RunStartResult, RunStatus as ProtoRunStatus,
};
use task_manager::TaskManager;
use tokio::sync::broadcast; // for SSE event streaming

const STDIO_FLAG: &str = "--stdio";
const STORE_PATH: &str = ".somaos/cases.db";
const MAX_AGENT_STEPS: usize = 32;
const MAX_TOOL_DISPLAY_CHARS: usize = 12_000;
const MAX_MODEL_OBSERVATION_CHARS: usize = 40_000;

const SOMA_CODING_AGENT_PROMPT: &str = r#"You are Soma, a terminal-native coding agent working inside a real software repository.

Operating rules:
- Treat the user's words literally. If the request is vague, conversational, or only says something like “测试”, do not inspect the repository on your own. Ask one concise clarifying question.
- Use tools only when they materially help answer or complete the request.
- For implementation work, continue the observe → edit → verify loop until the request is complete, blocked, or needs user approval. Do not stop after one tool call.
- Emit at most one tool call per model response. After receiving its result, decide the next action in a new response.
- Prefer file_edit for precise changes to existing files. Use file_write for new files or deliberate full replacement. Do not use shell redirection to edit files.
- After modifying code, run the smallest relevant formatter/check/test automatically when policy allows it.
- Never claim that you read, changed, or verified something unless the corresponding tool result supports it.
- Keep progress narration brief and specific. Do not repeat generic phrases such as “让我先看看”.
- Do not dump raw JSON to the user. Summarize tool results in normal language.
- Dangerous or external side effects require explicit approval. If a safe action is denied, explain the exact blocker and continue with any remaining safe work.
- Reply in the user's language unless code or identifiers require otherwise.
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PermissionMode {
    TrustedWorkspace,
    AskOnWrite,
    ReadOnly,
}

impl PermissionMode {
    fn from_env() -> Self {
        match std::env::var("SOMA_PERMISSION_MODE")
            .unwrap_or_else(|_| "trusted_workspace".to_string())
            .to_ascii_lowercase()
            .as_str()
        {
            "read_only" | "readonly" => Self::ReadOnly,
            "ask_on_write" | "ask" => Self::AskOnWrite,
            _ => Self::TrustedWorkspace,
        }
    }
}

// ── Shared state ──

struct AppState {
    store: Arc<SqliteCaseStore>,
    registry: Arc<CapabilityRegistry>,
    /// 活跃 Run 的取消标志
    active_runs: Mutex<std::collections::HashMap<String, Arc<AtomicBool>>>,
    /// 任务管理器
    task_manager: Mutex<TaskManager>,
    /// 事件 sink — 运行时事件 → JSON-RPC notification
    event_sink: Arc<dyn EventSink>,
    /// Output writer（HTTP 模式也需要写响应）
    output: Arc<OutputWriter>,
    /// SSE 事件广播通道（HTTP 模式用）
    event_tx: broadcast::Sender<String>,
}

// ── Output writer (shared between main loop and async run tasks) ──

pub(crate) struct OutputWriter {
    pub(crate) inner: Mutex<BufWriter<io::Stdout>>,
}

impl OutputWriter {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new(BufWriter::new(io::stdout())),
        }
    }

    pub(crate) fn write_response(&self, resp: &Response) {
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

    pub(crate) fn write_notification(&self, method: &str, params: &serde_json::Value) {
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

    pub(crate) fn write_error(&self, id: u64, code: i32, message: &str) {
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

    let file_organ =
        Arc::new(FileOrgan::new(repo_root.clone())) as Arc<dyn soma_capability::organ::Organ>;
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
                    "path": {"type": "string", "description": "文件名或相对路径后缀过滤（可选）"},
                    "max_results": {"type": "integer", "description": "最多返回多少条，默认 200"}
                },
                "required": ["action", "pattern"]
            }),
        ),
        file_organ.clone(),
    );
    registry.register_arc(
        CapabilityContract::basic(
            "file_edit",
            "精确替换仓库内现有文件的一段文本；old 默认必须只匹配一次",
            EffectClass::WriteLocal,
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "replace"},
                    "path": {"type": "string", "description": "仓库内文件路径"},
                    "old": {"type": "string", "description": "必须精确匹配的原文本"},
                    "new": {"type": "string", "description": "替换后的文本"},
                    "replace_all": {"type": "boolean", "description": "是否替换全部匹配，默认 false"}
                },
                "required": ["action", "path", "old", "new"]
            }),
        ),
        file_organ.clone(),
    );
    registry.register_arc(
        CapabilityContract::basic(
            "file_write",
            "在仓库内创建文件或完整覆写文件；修改现有文件优先使用 file_edit",
            EffectClass::WriteLocal,
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"const": "write"},
                    "path": {"type": "string", "description": "仓库内文件路径"},
                    "content": {"type": "string", "description": "完整文件内容"},
                    "create_parents": {"type": "boolean", "description": "父目录不存在时是否创建，默认 false"}
                },
                "required": ["action", "path", "content"]
            }),
        ),
        file_organ,
    );

    let process_organ =
        Arc::new(ProcessOrgan::new(repo_root.clone())) as Arc<dyn soma_capability::organ::Organ>;
    let mut p_contract = CapabilityContract::basic(
        "process_run",
        "在当前项目内执行开发命令；高破坏命令会被策略层拒绝",
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

    let git_organ_status = Arc::new(GitOrgan::new(repo_root.clone(), "status"))
        as Arc<dyn soma_capability::organ::Organ>;
    let git_organ_diff = Arc::new(GitOrgan::new(repo_root.clone(), "diff"))
        as Arc<dyn soma_capability::organ::Organ>;
    let git_organ_log =
        Arc::new(GitOrgan::new(repo_root, "log")) as Arc<dyn soma_capability::organ::Organ>;

    let entries: Vec<(
        &str,
        &str,
        serde_json::Value,
        Arc<dyn soma_capability::organ::Organ>,
    )> = vec![
        (
            "git_status",
            "查看 git 仓库状态（dirty 文件、暂存区）",
            serde_json::json!({
                "type": "object",
                "properties": {"action": {"type": "string", "description": "固定为 status"}},
                "required": []
            }),
            git_organ_status,
        ),
        (
            "git_diff",
            "查看 git diff（工作树与 HEAD 的差异）",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "固定为 diff"},
                    "path": {"type": "string", "description": "指定文件路径（可选）"}
                },
                "required": []
            }),
            git_organ_diff,
        ),
        (
            "git_log",
            "查看 git 提交日志",
            serde_json::json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "固定为 log"},
                    "max_count": {"type": "integer", "description": "最大提交数（默认 10）"}
                },
                "required": []
            }),
            git_organ_log,
        ),
    ];
    for (name, desc, schema, organ) in entries {
        registry.register_arc(
            CapabilityContract::basic(name, desc, EffectClass::ReadOnly, schema),
            organ,
        );
    }
    registry
}

// ── Model provider factory ──

fn build_provider() -> Option<Box<dyn ModelProvider + Send + Sync>> {
    let requested = std::env::var("SOMA_PROVIDER")
        .unwrap_or_default()
        .to_ascii_lowercase();

    let claude = || {
        soma_model_rig::RigClaudeProvider::from_env()
            .map(|provider| {
                Box::new(provider.with_system_prompt(SOMA_CODING_AGENT_PROMPT))
                    as Box<dyn ModelProvider + Send + Sync>
            })
            .ok()
    };
    let deepseek = || {
        soma_model_rig::deepseek::DeepSeekProvider::from_env()
            .map(|provider| {
                Box::new(provider.with_system_prompt(SOMA_CODING_AGENT_PROMPT))
                    as Box<dyn ModelProvider + Send + Sync>
            })
            .ok()
    };

    match requested.as_str() {
        "anthropic" | "claude" => claude(),
        "deepseek" => deepseek(),
        // 未显式指定时优先 Claude；不再因为 DeepSeek key 恰好存在就静默切换模型。
        _ => claude().or_else(deepseek),
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
            let evidence_suffix = &hash[..hash.len().min(8)];
            let evidence_type = match name {
                n if n.starts_with("file_") || n.starts_with("git_") => "Observation",
                _ => "Change",
            };
            engine.record_evidence(
                &format!("EV-{}-{}", name, evidence_suffix),
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

/// 执行能力时同时监听 task/cancel。丢弃执行 future 后，ProcessOrgan 的
/// kill_on_drop 会终止其子进程；文件能力本身是短操作。
async fn execute_capability_cancellable(
    engine: &mut TurnEngine,
    registry: &CapabilityRegistry,
    name: &str,
    arguments: serde_json::Value,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<String, ()> {
    tokio::select! {
        observation = execute_capability(engine, registry, name, arguments) => Ok(observation),
        changed = cancel_rx.changed() => {
            let _ = changed;
            Err(())
        }
    }
}

#[derive(Debug)]
struct CapabilityDisplay {
    success: bool,
    exit_code: i32,
    summary: String,
    output: String,
    truncated: bool,
}

fn truncate_chars(text: &str, max_chars: usize) -> (String, bool) {
    let count = text.chars().count();
    if count <= max_chars {
        return (text.to_string(), false);
    }
    let truncated: String = text.chars().take(max_chars).collect();
    (
        format!(
            "{}\n… output truncated ({} chars omitted)",
            truncated,
            count - max_chars
        ),
        true,
    )
}

fn format_duration_ms(duration_ms: u64) -> String {
    if duration_ms < 1_000 {
        format!("{} ms", duration_ms)
    } else {
        format!("{:.1} s", duration_ms as f64 / 1_000.0)
    }
}

fn rust_test_result_summary(output: &str) -> Option<String> {
    output
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with("test result:"))
        .map(|line| line.trim_end_matches('.').to_string())
}

fn display_capability_result(name: &str, observation: &str) -> CapabilityDisplay {
    if observation.starts_with("执行失败:")
        || observation.starts_with("请求被拒绝:")
        || observation.starts_with("用户拒绝")
        || observation.starts_with("审批超时")
    {
        return CapabilityDisplay {
            success: false,
            exit_code: 1,
            summary: observation.to_string(),
            output: String::new(),
            truncated: false,
        };
    }

    let value =
        serde_json::from_str::<serde_json::Value>(observation).unwrap_or(serde_json::Value::Null);
    let get_str = |key: &str| value.get(key).and_then(|v| v.as_str()).unwrap_or("");
    let get_u64 = |key: &str| value.get(key).and_then(|v| v.as_u64()).unwrap_or(0);

    let (success, exit_code, summary, raw_output) = match name {
        "file_read" => {
            let path = get_str("path");
            let size = get_u64("size");
            (
                true,
                0,
                format!("已读取 {} · {} bytes", path, size),
                String::new(),
            )
        }
        "file_search" => {
            let total = get_u64("total");
            let output = value
                .get("matches")
                .and_then(|v| v.as_array())
                .map(|matches| {
                    matches
                        .iter()
                        .take(40)
                        .map(|item| {
                            format!(
                                "{}:{}  {}",
                                item.get("file").and_then(|v| v.as_str()).unwrap_or("?"),
                                item.get("line").and_then(|v| v.as_u64()).unwrap_or(0),
                                item.get("content")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim()
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            (true, 0, format!("找到 {} 处匹配", total), output)
        }
        "file_edit" => {
            let path = get_str("path");
            let replacements = get_u64("replacements");
            (
                true,
                0,
                format!("已修改 {} · {} 处替换", path, replacements),
                String::new(),
            )
        }
        "file_write" => {
            let path = get_str("path");
            let created = value
                .get("created")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let bytes = get_u64("bytes_after");
            let verb = if created { "已创建" } else { "已写入" };
            (
                true,
                0,
                format!("{} {} · {} bytes", verb, path, bytes),
                String::new(),
            )
        }
        "process_run" => {
            let code = value
                .get("exit_code")
                .and_then(|v| v.as_i64())
                .unwrap_or(-1) as i32;
            let ok = value
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(code == 0);
            let duration_ms = get_u64("duration_ms");
            let stdout = get_str("stdout");
            let stderr = get_str("stderr");
            let output = match (stdout.is_empty(), stderr.is_empty()) {
                (false, false) => format!("{}\n{}", stdout.trim_end(), stderr.trim_end()),
                (false, true) => stdout.to_string(),
                (true, false) => stderr.to_string(),
                (true, true) => String::new(),
            };
            let elapsed = format_duration_ms(duration_ms);
            let summary = if let Some(test_result) = rust_test_result_summary(&output) {
                format!("{} · {}", test_result, elapsed)
            } else if ok {
                format!("命令完成 · {}", elapsed)
            } else {
                format!("命令失败 · exit {} · {}", code, elapsed)
            };
            (ok, code, summary, output)
        }
        "git_status" => {
            let status = get_str("status");
            let count = status
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count();
            let summary = if count == 0 {
                "工作区干净".to_string()
            } else {
                format!("{} 个工作区改动", count)
            };
            (true, 0, summary, status.to_string())
        }
        "git_diff" => {
            let diff = get_str("diff");
            let lines = diff.lines().count();
            let summary = if diff.trim().is_empty() {
                "没有未提交 diff".to_string()
            } else {
                format!("已读取 diff · {} 行", lines)
            };
            (true, 0, summary, diff.to_string())
        }
        "git_log" => {
            let log = get_str("log");
            let count = log.lines().filter(|line| !line.trim().is_empty()).count();
            (
                true,
                0,
                format!("读取 {} 条提交记录", count),
                log.to_string(),
            )
        }
        _ => (true, 0, format!("{} 执行完成", name), String::new()),
    };

    let (output, truncated) = truncate_chars(&raw_output, MAX_TOOL_DISPLAY_CHARS);
    CapabilityDisplay {
        success,
        exit_code,
        summary,
        output,
        truncated,
    }
}

// ── Policy decision for a tool call (runtime: no interactive user) ──

fn decide_capability(
    name: &str,
    arguments: &serde_json::Value,
    registry: &CapabilityRegistry,
) -> PolicyDecision {
    let contract = match registry.contract(name) {
        None => return PolicyDecision::Deny(format!("未知能力: {}", name)),
        Some(c) => c,
    };
    let mode = PermissionMode::from_env();

    if matches!(name, "file_edit" | "file_write") {
        let path = arguments.get("path").and_then(|v| v.as_str()).unwrap_or("");
        if policy::is_sensitive_path(path) {
            return PolicyDecision::Deny(format!("拒绝修改敏感文件: {}", path));
        }
    }

    match contract.effect_class {
        EffectClass::ReadOnly => PolicyDecision::Allow,
        EffectClass::WriteLocal => {
            if mode == PermissionMode::ReadOnly {
                return PolicyDecision::Deny("当前权限模式为 read_only".to_string());
            }

            if contract.capability_id == "process_run" {
                let cmd = arguments
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match policy::classify_command(cmd) {
                    policy::CommandRisk::Safe => PolicyDecision::Allow,
                    policy::CommandRisk::Warning { description } => {
                        if mode == PermissionMode::TrustedWorkspace {
                            PolicyDecision::Allow
                        } else {
                            PolicyDecision::NeedsOwner {
                                reason: format!("{} — {}", description, cmd),
                            }
                        }
                    }
                    policy::CommandRisk::Forbidden { description } => {
                        PolicyDecision::Deny(format!("🚫 {}", description))
                    }
                }
            } else if mode == PermissionMode::TrustedWorkspace {
                PolicyDecision::Allow
            } else {
                PolicyDecision::NeedsOwner {
                    reason: format!("允许项目内写入：{}", contract.description),
                }
            }
        }
        EffectClass::WriteGlobal => PolicyDecision::Deny("全局写入操作暂不支持".into()),
        EffectClass::SideEffect => PolicyDecision::NeedsOwner {
            reason: format!("需要用户授权副作用操作: {}", contract.description),
        },
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
    output.write_notification(
        "run.started",
        &serde_json::json!({
            "case_id": case_id,
            "run_id": run_id,
        }),
    );

    // 构建 Model Provider
    let provider = match build_provider() {
        Some(p) => p,
        None => {
            let msg = "无可用模型 Provider（设 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY）".to_string();
            let _ = store.update_run_status(
                &run_id,
                StoreRunStatus::Failed,
                Some(&chrono::Utc::now().to_rfc3339()),
                Some(&msg),
            );
            output.write_notification(
                "run.failed",
                &serde_json::json!({
                    "case_id": case_id, "run_id": run_id, "error": msg,
                }),
            );
            return RunResult::Failed(msg);
        }
    };

    // 通知；run.output（模型开始思考前的初始消息）
    output.write_notification(
        "run.output",
        &serde_json::json!({
            "case_id": case_id, "run_id": run_id, "sequence": 0,
            "text": format!("🧠 开始调查: {}", input),
        }),
    );

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
            output.write_notification(
                "run.output",
                &serde_json::json!({
                    "case_id": case_id, "run_id": run_id, "sequence": 1,
                    "text": text,
                }),
            );

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

            output.write_notification(
                "run.output",
                &serde_json::json!({
                    "case_id": case_id, "run_id": run_id, "sequence": 2,
                    "text": format!("⚡ {} 执行结果: {}", tc.name, obs),
                }),
            );

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
                        &run_id,
                        StoreRunStatus::Completed,
                        Some(&chrono::Utc::now().to_rfc3339()),
                        Some(&outcome),
                    );
                    output.write_notification(
                        "run.output",
                        &serde_json::json!({
                            "case_id": case_id, "run_id": run_id, "sequence": 3,
                            "text": cont_text,
                        }),
                    );
                    output.write_notification(
                        "run.completed",
                        &serde_json::json!({
                            "case_id": case_id, "run_id": run_id, "outcome": outcome,
                        }),
                    );
                    RunResult::Completed(outcome)
                }
                Err(e) => fail_run(&run_id, &case_id, &store, &output, &e).await,
            }
        }
        None => {
            // 模型直接给出结论
            engine.finish(&text);
            let _ = store.update_run_status(
                &run_id,
                StoreRunStatus::Completed,
                Some(&chrono::Utc::now().to_rfc3339()),
                Some(&text),
            );
            output.write_notification(
                "run.output",
                &serde_json::json!({
                    "case_id": case_id, "run_id": run_id, "sequence": 1,
                    "text": text,
                }),
            );
            output.write_notification(
                "run.completed",
                &serde_json::json!({
                    "case_id": case_id, "run_id": run_id, "outcome": text,
                }),
            );
            RunResult::Completed(text)
        }
    }
}

async fn fail_run(
    run_id: &str,
    case_id: &str,
    store: &Arc<SqliteCaseStore>,
    output: &Arc<OutputWriter>,
    error: &str,
) -> RunResult {
    let _ = store.update_run_status(
        run_id,
        StoreRunStatus::Failed,
        Some(&chrono::Utc::now().to_rfc3339()),
        Some(error),
    );
    output.write_notification(
        "run.failed",
        &serde_json::json!({
            "case_id": case_id, "run_id": run_id, "error": error,
        }),
    );
    RunResult::Failed(error.to_string())
}

// ── Task Turn Execution ──

/// 为 task/send_message 执行 AI Turn
///
/// 在 tokio::spawn 中运行，通过 EventSink 流式输出事件：
///   AssistantDelta → (ToolStarted → ToolCompleted)* → TurnCompleted/TurnFailed
///
/// 与 run_turn_engine 的区别：
///   - 使用 EventSink 而非 OutputWriter（事件进入 task/event notification 通道）
///   - 使用 TaskManager 而非 RunStore 管理状态
///   - 没有 case_id 绑定（任务独立于 case）
async fn run_task_turn(task_id: String, turn_id: String, input: String, state: Arc<AppState>) {
    use soma_protocol::events::RuntimeEventKind::*;

    // sequence=0 已由 handle_task_send_message 发出 TurnStarted。
    let sequence = AtomicU64::new(1);
    let emit = |kind, payload: serde_json::Value| {
        let seq = sequence.fetch_add(1, Ordering::SeqCst);
        state
            .event_sink
            .emit_event(&task_id, &turn_id, seq, kind, payload);
    };

    let is_cancelled = || -> bool {
        state
            .task_manager
            .lock()
            .unwrap()
            .get(&task_id)
            .map_or(false, |task| task.status == "interrupted")
    };

    let save_conversation = |engine: &TurnEngine| {
        let conv = engine.conversation();
        state
            .task_manager
            .lock()
            .unwrap()
            .set_conversation(&task_id, conv);
    };

    // 最常见的连通性输入走确定性回复：不消耗模型、不侦察仓库，也不要求 API Key。
    let provider = match build_provider() {
        Some(provider) => provider,
        None => {
            let msg =
                "无可用模型 Provider（设置 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY）".to_string();
            emit(TurnFailed, serde_json::json!({"error": msg}));
            state.task_manager.lock().unwrap().fail_turn(&task_id);
            return;
        }
    };

    if is_cancelled() {
        emit(TurnInterrupted, serde_json::json!({}));
        return;
    }

    let mut engine = TurnEngine::new(provider, task_id.clone());
    let conversation = state
        .task_manager
        .lock()
        .unwrap()
        .get_conversation(&task_id);
    engine.with_conversation(conversation);
    let tools = state.registry.tool_definitions();
    engine.start(&input, tools);

    // task/cancel 通过该 channel 中断当前模型请求。工具执行目前仍由各 Organ
    // 自己负责超时；后续可将同一个 cancellation token 下沉到 ProcessOrgan。
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    state
        .task_manager
        .lock()
        .unwrap()
        .register_cancel(&task_id, cancel_tx);

    let mut first_request = true;
    let mut last_tool_fingerprint: Option<String> = None;
    let mut consecutive_tool_repeats = 0usize;

    for step in 0..MAX_AGENT_STEPS {
        if is_cancelled() {
            save_conversation(&engine);
            emit(TurnInterrupted, serde_json::json!({"step": step}));
            return;
        }

        let cancel_rx_step = cancel_rx.clone();
        let response = if first_request {
            first_request = false;
            engine
                .request_model_with_delta(
                    |delta| emit(AssistantDelta, serde_json::json!({"text": delta})),
                    async move {
                        let mut rx = cancel_rx_step;
                        let _ = rx.changed().await;
                    },
                )
                .await
        } else {
            engine
                .continue_turn_with_delta(
                    |delta| emit(AssistantDelta, serde_json::json!({"text": delta})),
                    async move {
                        let mut rx = cancel_rx_step;
                        let _ = rx.changed().await;
                    },
                )
                .await
        };

        let (text, tool_call) = match response {
            Ok(result) => result,
            Err(error) if error == "cancelled" || is_cancelled() => {
                save_conversation(&engine);
                emit(TurnInterrupted, serde_json::json!({"step": step}));
                return;
            }
            Err(error) => {
                save_conversation(&engine);
                emit(
                    TurnFailed,
                    serde_json::json!({"error": error, "step": step}),
                );
                state.task_manager.lock().unwrap().fail_turn(&task_id);
                return;
            }
        };

        let Some(tool_call) = tool_call else {
            engine.finish(&text);
            save_conversation(&engine);
            emit(
                TurnCompleted,
                serde_json::json!({"outcome": text, "steps": step + 1}),
            );
            state.task_manager.lock().unwrap().complete_turn(&task_id);
            return;
        };

        let fingerprint = format!(
            "{}:{}",
            tool_call.name,
            serde_json::to_string(&tool_call.arguments).unwrap_or_default()
        );
        if last_tool_fingerprint.as_deref() == Some(fingerprint.as_str()) {
            consecutive_tool_repeats += 1;
        } else {
            last_tool_fingerprint = Some(fingerprint);
            consecutive_tool_repeats = 1;
        }
        if consecutive_tool_repeats > 3 {
            let error = format!(
                "检测到重复工具调用，已停止：{}（相同参数连续出现 {} 次）",
                tool_call.name, consecutive_tool_repeats
            );
            engine.record_permission_denied(&tool_call.name, &error);
            save_conversation(&engine);
            emit(
                TurnFailed,
                serde_json::json!({"error": error, "step": step}),
            );
            state.task_manager.lock().unwrap().fail_turn(&task_id);
            return;
        }

        emit(
            ToolStarted,
            serde_json::json!({
                "tool_call_id": &tool_call.id,
                "capability_id": &tool_call.name,
                "arguments": tool_call.arguments.clone(),
            }),
        );

        let decision = decide_capability(&tool_call.name, &tool_call.arguments, &state.registry);
        engine.record_policy_evaluated(
            &tool_call.name,
            &format!("{:?}", &decision),
            "effect_class",
        );

        let observation = match &decision {
            PolicyDecision::Allow => {
                match execute_capability_cancellable(
                    &mut engine,
                    &state.registry,
                    &tool_call.name,
                    tool_call.arguments.clone(),
                    cancel_rx.clone(),
                )
                .await
                {
                    Ok(observation) => observation,
                    Err(()) => {
                        save_conversation(&engine);
                        emit(TurnInterrupted, serde_json::json!({"step": step}));
                        return;
                    }
                }
            }
            PolicyDecision::Deny(reason) => {
                engine.record_permission_denied(&tool_call.name, reason);
                format!("请求被拒绝: {}", reason)
            }
            PolicyDecision::NeedsOwner { reason } => {
                let (approval_tx, approval_rx) = tokio::sync::oneshot::channel::<bool>();
                let approval_id = format!("apr-{}-{}-{}", task_id, turn_id, step);
                state
                    .task_manager
                    .lock()
                    .unwrap()
                    .register_approval(&approval_id, approval_tx);

                emit(
                    ApprovalRequested,
                    serde_json::json!({
                        "approval_id": &approval_id,
                        "prompt": format!("{}\n\n能力：{}", reason, tool_call.name),
                        "timeout_ms": 300000,
                    }),
                );

                let mut cancel_rx_approval = cancel_rx.clone();
                let approval = tokio::select! {
                    result = tokio::time::timeout(
                        std::time::Duration::from_secs(300),
                        approval_rx,
                    ) => match result {
                        Ok(Ok(value)) => Some(value),
                        Ok(Err(_)) => Some(false),
                        Err(_) => None,
                    },
                    _ = cancel_rx_approval.changed() => {
                        state
                            .task_manager
                            .lock()
                            .unwrap()
                            .remove_approval(&approval_id);
                        save_conversation(&engine);
                        emit(TurnInterrupted, serde_json::json!({"step": step}));
                        return;
                    }
                };

                state
                    .task_manager
                    .lock()
                    .unwrap()
                    .remove_approval(&approval_id);

                match approval {
                    Some(true) => {
                        match execute_capability_cancellable(
                            &mut engine,
                            &state.registry,
                            &tool_call.name,
                            tool_call.arguments.clone(),
                            cancel_rx.clone(),
                        )
                        .await
                        {
                            Ok(observation) => observation,
                            Err(()) => {
                                save_conversation(&engine);
                                emit(TurnInterrupted, serde_json::json!({"step": step}));
                                return;
                            }
                        }
                    }
                    Some(false) => {
                        engine.record_permission_denied(&tool_call.name, reason);
                        format!("用户拒绝了操作: {}", reason)
                    }
                    None => {
                        engine.record_permission_denied(&tool_call.name, reason);
                        format!("审批超时: {}", reason)
                    }
                }
            }
        };

        let display = display_capability_result(&tool_call.name, &observation);
        if !display.output.trim().is_empty() {
            emit(
                ToolUpdated,
                serde_json::json!({
                    "tool_call_id": &tool_call.id,
                    "output": display.output,
                    "truncated": display.truncated,
                }),
            );
        }
        emit(
            ToolCompleted,
            serde_json::json!({
                "tool_call_id": &tool_call.id,
                "success": display.success,
                "exit_code": display.exit_code,
                "result_summary": display.summary,
            }),
        );

        if is_cancelled() {
            save_conversation(&engine);
            emit(TurnInterrupted, serde_json::json!({"step": step}));
            return;
        }

        let (model_observation, _) = truncate_chars(&observation, MAX_MODEL_OBSERVATION_CHARS);
        if let Err(error) = engine.provide_observation(&model_observation) {
            save_conversation(&engine);
            emit(
                TurnFailed,
                serde_json::json!({"error": error, "step": step}),
            );
            state.task_manager.lock().unwrap().fail_turn(&task_id);
            return;
        }
    }

    let error = format!(
        "Agent 达到最大步骤数 {}，为避免无限循环已停止",
        MAX_AGENT_STEPS
    );
    save_conversation(&engine);
    emit(TurnFailed, serde_json::json!({"error": error}));
    state.task_manager.lock().unwrap().fail_turn(&task_id);
}

async fn handle_cancel(
    run_id: &str,
    case_id: &str,
    store: &Arc<SqliteCaseStore>,
    output: &Arc<OutputWriter>,
) -> RunResult {
    let _ = store.update_run_status(
        run_id,
        StoreRunStatus::Cancelled,
        Some(&chrono::Utc::now().to_rfc3339()),
        Some("用户取消"),
    );
    output.write_notification(
        "run.cancelled",
        &serde_json::json!({
            "case_id": case_id, "run_id": run_id,
        }),
    );
    RunResult::Failed("用户取消".to_string())
}

// ── Request handlers ──

pub(crate) fn handle_case_create(
    params: serde_json::Value,
    store: &Arc<SqliteCaseStore>,
) -> Result<serde_json::Value, String> {
    let p: CaseCreateParams =
        serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

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
    case_store
        .append(&case_id, &event)
        .map_err(|e| format!("store error: {}", e))?;

    let result = CaseCreateResult { case_id };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_case_get(
    params: serde_json::Value,
    store: &Arc<SqliteCaseStore>,
) -> Result<serde_json::Value, String> {
    let p: CaseGetParams =
        serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    let case_store: Arc<dyn CaseStore> = store.clone();
    let events = case_store
        .replay(&p.case_id)
        .map_err(|e| format!("store error: {}", e))?;

    let result = CaseGetResult {
        case_id: p.case_id,
        title: "".into(), // 从事件中提取需要解析事件，暂略
        status: if events.is_empty() {
            "unknown"
        } else {
            "active"
        }
        .into(),
        event_count: events.len() as u64,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_run_start(
    params: serde_json::Value,
    state: &Arc<AppState>,
    output: &Arc<OutputWriter>,
    runtime_case_store: Arc<SqliteCaseStore>,
) -> Result<serde_json::Value, String> {
    let p: RunStartParams =
        serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

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
    state
        .store
        .insert_run(&record)
        .map_err(|e| format!("store error: {}", e))?;

    // 设置取消标志
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state
        .active_runs
        .lock()
        .unwrap()
        .insert(run_id.clone(), cancel_flag.clone());

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
        )
        .await;

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

pub(crate) fn handle_run_get(
    params: serde_json::Value,
    store: &Arc<SqliteCaseStore>,
) -> Result<serde_json::Value, String> {
    let p: RunGetParams =
        serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    match store
        .get_run(&p.run_id)
        .map_err(|e| format!("store error: {}", e))?
    {
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

pub(crate) fn handle_run_cancel(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let p: RunCancelParams =
        serde_json::from_value(params).map_err(|e| format!("invalid params: {}", e))?;

    // 设置取消标志
    if let Some(flag) = state.active_runs.lock().unwrap().get(&p.run_id) {
        flag.store(true, Ordering::SeqCst);
    }

    let _ = state.store.update_run_status(
        &p.run_id,
        StoreRunStatus::Cancelled,
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
    let query = params
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'query' field".to_string())?;

    let description = soma_core::combo::pipeline_display::render_describe(query);
    let result = soma_protocol::params::PipelineDescribeResult { description };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

// ── Gap Handlers ──

fn handle_gap_search(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = params
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'query' field".to_string())?;

    let report = soma_core::combo::capability_searcher::render_gap_search(query);
    let result = soma_protocol::params::GapSearchResult { report };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

fn handle_gap_propose(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = params
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'query' field".to_string())?;

    let proposal = soma_core::combo::capability_searcher::propose_softill(query);
    let proposal_text = soma_core::combo::capability_searcher::render_proposal(&proposal);
    let result = soma_protocol::params::GapProposeResult {
        proposal: proposal_text,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

// ── Softill Export Handlers ──

fn handle_softill_export(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let softill_id = params
        .get("softill_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'softill_id' field".to_string())?;
    let output_dir = params
        .get("output_dir")
        .and_then(|v| v.as_str())
        .unwrap_or(".");

    let out_path = std::path::Path::new(output_dir).join(&softill_id);
    let pkg = soma_core::combo::softill_export::export_by_id(softill_id, &out_path)?;

    let result = soma_protocol::params::SoftillExportResult {
        output_dir: pkg.output_dir.to_string_lossy().to_string(),
        file_count: pkg.files.len() as u32,
        message: format!("导出成功: {} 个文件", pkg.files.len()),
    };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

// ── Task Handlers ──

pub(crate) fn handle_task_create(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let title = params
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'title' field".to_string())?;
    let project_root = params
        .get("project_root")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'project_root' field".to_string())?;

    let result = state
        .task_manager
        .lock()
        .unwrap()
        .create(title, project_root);
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_task_list(
    _params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let tasks = state.task_manager.lock().unwrap().list();
    let result = soma_protocol::params::TaskListResult { tasks };
    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_task_get(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let task_id = params
        .get("task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'task_id' field".to_string())?;

    let task = state
        .task_manager
        .lock()
        .unwrap()
        .get(task_id)
        .ok_or_else(|| format!("task {} not found", task_id))?;
    serde_json::to_value(task).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_task_send_message(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let task_id = params
        .get("task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'task_id' field".to_string())?;
    let input = params
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'text' field".to_string())?
        .to_string();

    let result = state
        .task_manager
        .lock()
        .unwrap()
        .start_turn(task_id)
        .map_err(|e| format!("cannot start turn: {}", e))?;

    let task_id_owned = task_id.to_string();
    let turn_id_owned = result.turn_id.clone();
    let state_clone = state.clone();

    // 通过 EventSink 发出 TurnStarted 事件
    state.event_sink.emit_event(
        &task_id_owned,
        &turn_id_owned,
        0,
        soma_protocol::events::RuntimeEventKind::TurnStarted,
        serde_json::json!({}),
    );

    // 异步执行 AI Turn
    tokio::spawn(async move {
        run_task_turn(task_id_owned, turn_id_owned, input, state_clone).await;
    });

    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_task_cancel(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let task_id = params
        .get("task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'task_id' field".to_string())?;

    let result = state
        .task_manager
        .lock()
        .unwrap()
        .cancel_turn(task_id)
        .map_err(|e| format!("cannot cancel: {}", e))?;

    // TurnInterrupted 由正在运行的 turn 以正确 sequence 发出。

    serde_json::to_value(result).map_err(|e| format!("serialize: {}", e))
}

pub(crate) fn handle_task_approve(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let approval_id = params
        .get("approval_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'approval_id' field".to_string())?;

    let found = state
        .task_manager
        .lock()
        .unwrap()
        .resolve_approval(approval_id, true);

    Ok(serde_json::json!({
        "resolved": found,
        "approved": true,
    }))
}

pub(crate) fn handle_task_reject(
    params: serde_json::Value,
    state: &Arc<AppState>,
) -> Result<serde_json::Value, String> {
    let approval_id = params
        .get("approval_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing 'approval_id' field".to_string())?;

    let found = state
        .task_manager
        .lock()
        .unwrap()
        .resolve_approval(approval_id, false);

    Ok(serde_json::json!({
        "resolved": found,
        "approved": false,
    }))
}

// ── Main ──

/// 从 `.somaos/env.json` 加载配置并设置环境变量
fn load_env_config() {
    let path = PathBuf::from(".somaos/env.json");
    if !path.exists() {
        return;
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(key) = config.get("deepseek_api_key").and_then(|v| v.as_str()) {
                    std::env::set_var("DEEPSEEK_API_KEY", key);
                    tracing::info!("Loaded DEEPSEEK_API_KEY from .somaos/env.json");
                }
                if let Some(key) = config.get("anthropic_api_key").and_then(|v| v.as_str()) {
                    std::env::set_var("ANTHROPIC_API_KEY", key);
                    tracing::info!("Loaded ANTHROPIC_API_KEY from .somaos/env.json");
                }
                if let Some(provider) = config.get("provider").and_then(|v| v.as_str()) {
                    std::env::set_var("SOMA_PROVIDER", provider);
                }
                if let Some(model) = config.get("model").and_then(|v| v.as_str()) {
                    std::env::set_var("SOMA_MODEL", model);
                }
                if let Some(mode) = config.get("permission_mode").and_then(|v| v.as_str()) {
                    std::env::set_var("SOMA_PERMISSION_MODE", mode);
                }
            }
        }
        Err(e) => {
            eprintln!("[runtime] 读取 .somaos/env.json 失败: {}", e);
        }
    }
}

fn main() {
    load_env_config();

    let args: Vec<String> = std::env::args().collect();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .with_writer(std::io::stderr)
        .init();

    let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

    if args.len() >= 2 && args[1] == "--http" {
        let port: u16 = args.get(2).and_then(|p| p.parse().ok()).unwrap_or(8080);
        rt.block_on(async_main_http(port));
    } else if args.len() >= 2 && args[1] == STDIO_FLAG {
        rt.block_on(async_main_stdio());
    } else {
        eprintln!("Usage:");
        eprintln!("  soma-runtime --stdio         JSON-RPC over stdin/stdout");
        eprintln!("  soma-runtime --http [PORT]    HTTP server (default port 8080)");
        std::process::exit(1);
    }
}

/// 构建共享的 AppState
async fn build_app_state() -> (Arc<AppState>, Arc<OutputWriter>) {
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

    let registry = Arc::new(build_registry(repo_root));

    if build_provider().is_none() {
        eprintln!(
            "[runtime] 警告: 未配置模型 Provider（设 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY）"
        );
    }

    let output = Arc::new(OutputWriter::new());
    // 创建 broadcast 通道，SSE 客户端和 Sink 共用
    let (event_tx, _) = broadcast::channel::<String>(256);
    // 使用 BroadcastNotificationSink（同时写 stdout + broadcast）
    let event_sink = Arc::new(event_adapter::BroadcastNotificationSink::new(
        output.clone(),
        event_tx.clone(),
    ));

    let state = Arc::new(AppState {
        store: store.clone(),
        registry,
        active_runs: Mutex::new(std::collections::HashMap::new()),
        task_manager: Mutex::new(TaskManager::new().with_store(store.clone())),
        event_sink,
        output: output.clone(),
        event_tx,
    });

    (state, output)
}

/// --stdio 模式：逐行读取 stdin
async fn async_main_stdio() {
    let (state, output) = build_app_state().await;

    let stdin = io::stdin();
    let reader = stdin.lock();
    let mut line_buf = String::new();
    let mut reader = io::BufReader::new(reader);

    loop {
        line_buf.clear();
        match reader.read_line(&mut line_buf) {
            Ok(0) => break,
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
                continue;
            }
        };

        let id = request.id;
        let result = match request.method.as_str() {
            "case/create" => handle_case_create(request.params, &state.store),
            "case/get" => handle_case_get(request.params, &state.store),
            "run/start" => handle_run_start(request.params, &state, &output, state.store.clone()),
            "run/get" => handle_run_get(request.params, &state.store),
            "run/cancel" => handle_run_cancel(request.params, &state),
            "pipeline/describe" => handle_pipeline_describe(request.params),
            "gap/search" => handle_gap_search(request.params),
            "gap/propose" => handle_gap_propose(request.params),
            "softill/export" => handle_softill_export(request.params),
            "task/create" => handle_task_create(request.params, &state),
            "task/list" => handle_task_list(request.params, &state),
            "task/get" => handle_task_get(request.params, &state),
            "task/send_message" => handle_task_send_message(request.params, &state),
            "task/cancel" => handle_task_cancel(request.params, &state),
            "task/approve" => handle_task_approve(request.params, &state),
            "task/reject" => handle_task_reject(request.params, &state),
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

    // 清理
    {
        let runs = state.active_runs.lock().unwrap();
        for (_, flag) in runs.iter() {
            flag.store(true, Ordering::SeqCst);
        }
    }
    eprintln!("[runtime] 退出");
}

/// --http 模式：启动 HTTP 服务器
async fn async_main_http(port: u16) {
    let (state, _output) = build_app_state().await;
    tracing::info!("Starting HTTP server on port {}", port);
    http_server::serve(state, port).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_display_is_human_readable() {
        let observation = serde_json::json!({
            "command": "cargo test -p soma-store",
            "stdout": "test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out.\n",
            "stderr": "",
            "exit_code": 0,
            "success": true,
            "duration_ms": 1234
        }).to_string();
        let display = display_capability_result("process_run", &observation);
        assert!(display.success);
        assert!(display.summary.contains("12 passed"));
        assert!(display.summary.contains("1.2 s"));
        assert!(!display.summary.contains("{\""));
    }

    #[test]
    fn tool_output_truncates_on_character_boundary() {
        let input = "你".repeat(MAX_TOOL_DISPLAY_CHARS + 20);
        let (output, truncated) = truncate_chars(&input, MAX_TOOL_DISPLAY_CHARS);
        assert!(truncated);
        assert!(output.starts_with(&"你".repeat(10)));
    }
}
