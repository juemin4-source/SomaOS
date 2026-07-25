//! # soma-tui —— SomaOS TUI 库
//!
//! 导出 TUI 的公共组件，供测试和集成使用。

pub mod app;
pub mod cells;
pub mod session;

use std::io;

use app::SomaTuiApp;
use soma_client::SomaClient;

/// 从外部（soma-cli）启动 TUI 的入口
pub fn run() -> io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::builder()
                .parse_lossy("soma_tui=info"),
        )
        .init();

    let rt = tokio::runtime::Runtime::new().map_err(|e| {
        io::Error::new(io::ErrorKind::Other, format!("tokio runtime: {}", e))
    })?;

    let app = rt.block_on(async {
        let client = SomaClient::connect(".").await.map_err(|e| {
            io::Error::new(io::ErrorKind::Other, e)
        })?;
        tracing::info!("Task: {}", client.task_id().unwrap_or("?"));
        Ok::<_, io::Error>(SomaTuiApp::new(client))
    })?;

    rt.block_on(eye_declare::driver_tokio::run_with(
        app,
        eye_declare::runtime::RunOptions::default(),
    ))?;

    Ok(())
}

