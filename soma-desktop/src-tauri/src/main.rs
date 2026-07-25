//! SomaOS Desktop — Tauri v2 桌面应用入口
//!
//! 启动流程：
//!   1. 创建 RuntimeManager（管理 soma-runtime 子进程）
//!   2. 注册 Tauri 命令（create_task, send_message 等）
//!   3. 启动后台通知监听器（JSON-RPC notification → Tauri event）
//!   4. 启动 Tauri 窗口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod runtime_manager;
mod event_bridge;
mod state;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Emitter, Manager};

use runtime_manager::RuntimeManager;
use event_bridge::EventBridge;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 启动 RuntimeManager（管理 soma-runtime 子进程）
            let runtime = Arc::new(Mutex::new(RuntimeManager::new()));
            let rt = runtime.clone();

            // 后台通知监听任务
            // 每轮只持有锁足够读取一条通知，处理完立即释放，
            // 这样 commands（也通过 runtime lock）不会被长时间阻塞。
            tokio::spawn(async move {
                // 先确保 runtime 进程已启动
                if let Err(e) = rt.lock().await.ensure_running().await {
                    tracing::error!("[desktop] Failed to start runtime: {}", e);
                    return;
                }

                loop {
                    let notif = {
                        let mut rt_guard = rt.lock().await;
                        match rt_guard.read_notification().await {
                            Ok(Some(n)) => n,
                            Ok(None) => {
                                tracing::info!("[desktop] Runtime process exited");
                                break;
                            }
                            Err(e) => {
                                tracing::error!("[desktop] Notification error: {}", e);
                                break;
                            }
                        }
                    };
                    // 锁已释放

                    // 通过 EventBridge 转换为 SomaUiEvent
                    if let Some(ui_event) = EventBridge::to_ui_event(&notif) {
                        let _ = app_handle.emit("soma-event", &ui_event);
                    }
                }
            });

            // 托管状态
            app.manage(runtime);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_task,
            commands::list_tasks,
            commands::get_task,
            commands::send_message,
            commands::cancel_turn,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
