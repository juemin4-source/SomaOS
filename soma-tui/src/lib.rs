//! # soma-tui —— SomaOS TUI 库
//!
//! 导出 TUI 的公共组件，供测试和集成使用。

pub mod app;
pub mod cells;
pub mod session;
pub mod workspace;

use std::io;
use std::sync::Arc;

use app::{SomaTuiApp, SomaTuiModel};
use soma_client::SomaClient;
use soma_ui_protocol::CellBuffer;
use workspace::context::SessionSummary;
use workspace::detect::detect_workspace;

/// 最小终端尺寸
const MIN_TERMINAL_WIDTH: u16 = 40;
const MIN_TERMINAL_HEIGHT: u16 = 10;

/// 从外部（soma-cli）启动 TUI 的入口
pub fn run() -> io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    // 1. 终端尺寸检查
    if let Some((w, h)) = terminal_size() {
        if w < MIN_TERMINAL_WIDTH || h < MIN_TERMINAL_HEIGHT {
            eprintln!(
                "⚠ 终端窗口过小 ({}x{})，至少需要 {}x{}。请放大终端窗口。",
                w, h, MIN_TERMINAL_WIDTH, MIN_TERMINAL_HEIGHT
            );
            return Ok(());
        }
    }

    // 2. 工作目录检查
    let cwd = match std::env::current_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!(
                "⚠ 无法访问当前工作目录: {}\n\
                 请切换到有效的项目目录后重试。",
                e
            );
            return Err(io::Error::new(io::ErrorKind::Other, format!("工作目录无效: {}", e)));
        }
    };
    if !cwd.is_dir() {
        eprintln!(
            "⚠ 当前路径不是有效目录: {}\n\
             请切换到项目目录后重试。",
            cwd.display()
        );
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("目录不存在: {}", cwd.display()),
        ));
    }
    let mut workspace_ctx = detect_workspace(&cwd);

    // 3. 启动 tokio runtime
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("tokio runtime: {}", e)))?;

    // 4. 连接 Runtime 子进程
    let app = rt.block_on(async {
        let client = match SomaClient::connect(".").await {
            Ok(c) => c,
            Err(e) => {
                // Runtime 启动失败 — 给出结构化提示
                return Err(io::Error::new(
                    io::ErrorKind::Other,
                    format!(
                        "Runtime 启动失败: {}\n\n\
                         可能的原因：\n\
                         • soma-runtime 未编译或不在 PATH 中\n\
                         • 缺少 API Key（需要 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY）\n\
                         • 项目目录没有写入权限（Runtime 需要创建 .somaos/ 目录）\n\
                         \n\
                         运行 `soma doctor` 查看诊断信息。",
                        e
                    ),
                ));
            }
        };
        let task_id = client.task_id().unwrap_or_else(|| "?".to_string());
        tracing::debug!("Task: {}", task_id);

        // 2a. 查询最近的任务（用于"上次会话"提示）
        match client.task_list().await {
            Ok(result) => {
                if let Some(recent) = find_most_recent_task(&result.tasks, &task_id) {
                    workspace_ctx.recent_session = Some(SessionSummary {
                        task_id: recent.id.clone(),
                        title: recent.title.clone(),
                        status: recent.status.clone(),
                        updated_at: recent.updated_at.clone(),
                    });
                    tracing::debug!("Recent task: {} ({})", recent.title, recent.status);
                }
            }
            Err(e) => tracing::warn!(error = %e, "Failed to list tasks"),
        }

        // 2b. 尝试恢复上次会话
        let mut model = SomaTuiModel::new();
        let mut is_restored = false;
        if let Some(saved) = session::load_session() {
            if saved.task_id == task_id {
                model.cell_buffer = CellBuffer::from_restored_cells(saved.cells);
                model.status = format!("已恢复上次终端记录 — {}", workspace_ctx.name);
                is_restored = true;
            }
        }

        // 3. 如果是全新启动，添加启动摘要
        if !is_restored {
            SomaTuiApp::populate_startup_info(&mut model, &workspace_ctx);
        }

        Ok::<_, io::Error>(SomaTuiApp {
            model,
            client: Arc::new(client),
            task_id,
            workspace_ctx,
            _pending_task: None,
        })
    })?;

    rt.block_on(eye_declare::driver_tokio::run_with(
        app,
        eye_declare::runtime::RunOptions::default(),
    ))?;

    // 打印退出摘要（在终端恢复后显示）
    if let Some(summary) = load_exit_summary() {
        println!("\n✓ 工作状态已保存");
        if let Some(branch) = &summary.branch {
            println!("  项目：{} · {}", summary.project, branch);
        } else {
            println!("  项目：{}", summary.project);
        }
        if summary.changed_files > 0 {
            println!("  文件改动：{} 个未提交文件", summary.changed_files);
        }
        println!();
        // 清理摘要文件
        let _ = std::fs::remove_file(
            std::path::PathBuf::from(".somaos").join("exit-summary.json")
        );
    }

    Ok(())
}

/// 从文件加载退出摘要
fn load_exit_summary() -> Option<ExitSummary> {
    let path = std::path::PathBuf::from(".somaos").join("exit-summary.json");
    if !path.exists() {
        return None;
    }
    let json = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&json).ok()?;
    Some(ExitSummary {
        project: value.get("project").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        branch: value.get("branch").and_then(|v| v.as_str()).map(|s| s.to_string()),
        changed_files: value.get("changed_files").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
        has_session: value.get("has_session").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

#[derive(Debug)]
struct ExitSummary {
    project: String,
    branch: Option<String>,
    changed_files: usize,
    #[allow(dead_code)]
    has_session: bool,
}

/// 获取终端尺寸（宽度和高度）
fn terminal_size() -> Option<(u16, u16)> {
    match crossterm::terminal::size() {
        Ok((w, h)) => Some((w, h)),
        Err(_) => None,
    }
}

/// 在任务列表中查找最近的非当前任务
fn find_most_recent_task(
    tasks: &[soma_protocol::params::TaskSummary],
    current_task_id: &str,
) -> Option<soma_protocol::params::TaskSummary> {
    tasks
        .iter()
        .filter(|t| t.id != current_task_id)
        .max_by(|a, b| a.updated_at.cmp(&b.updated_at))
        .cloned()
}
