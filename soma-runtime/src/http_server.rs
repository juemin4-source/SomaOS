//! HTTP 服务器模式 — 在浏览器中访问 SomaOS
//!
//! 用法: soma-runtime --http 8080
//!
//! API:
//!   POST /api — JSON-RPC 请求（等价于 --stdio 的 stdin 输入）
//!   GET  /api/events — SSE 事件流（等价于 --stdio 的 notification 行）
//!   GET  / — 前端静态文件（从 soma-desktop/dist 提供）

use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::State;
use axum::response::sse::{Event, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::AppState;

/// JSON-RPC 请求信封（HTTP 版）
#[derive(Deserialize)]
struct JsonRpcRequest {
    #[serde(default)]
    id: u64,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

/// JSON-RPC 响应信封（HTTP 版）
#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

/// 启动 HTTP 服务器
pub async fn serve(state: Arc<AppState>, port: u16) {
    // 前端静态文件目录：优先用命令行参数，其次相对于二进制路径
    let dist_dir = std::env::var("SOMA_DIST_DIR").unwrap_or_else(|_| {
        // 默认相对于 target/debug/ 的路径
        let exe = std::env::current_exe().ok();
        if let Some(path) = exe.and_then(|p| p.parent().map(|p| p.join("../../../soma-desktop/dist"))) {
            path.to_string_lossy().to_string()
        } else {
            "../soma-desktop/dist".to_string()
        }
    });

    let app = Router::new()
        .route("/api", post(handle_jsonrpc))
        .route("/api/events", get(handle_sse))
        .fallback_service(ServeDir::new(&dist_dir))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("SomaOS HTTP server starting on http://{}", addr);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("Failed to bind to port {}: {}", port, e);
            return;
        }
    };

    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("Server error: {}", e);
    }
}

/// JSON-RPC 端点
async fn handle_jsonrpc(
    State(state): State<Arc<AppState>>,
    Json(req): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    let id = req.id;

    let result = match req.method.as_str() {
        "task/create" => crate::handle_task_create(req.params, &state),
        "task/list" => crate::handle_task_list(req.params, &state),
        "task/get" => crate::handle_task_get(req.params, &state),
        "task/send_message" => crate::handle_task_send_message(req.params, &state),
        "task/cancel" => crate::handle_task_cancel(req.params, &state),
        "case/create" => crate::handle_case_create(req.params, &state.store),
        "case/get" => crate::handle_case_get(req.params, &state.store),
        "run/start" => crate::handle_run_start(req.params, &state, &state.output, state.store.clone()),
        "run/get" => crate::handle_run_get(req.params, &state.store),
        "run/cancel" => crate::handle_run_cancel(req.params, &state),
        _ => Err(format!("unknown method: {}", req.method)),
    };

    match result {
        Ok(value) => Json(JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: Some(value),
            error: None,
        }),
        Err(e) => Json(JsonRpcResponse {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: e,
            }),
        }),
    }
}

/// SSE 事件流端点
async fn handle_sse(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| match msg {
        Ok(json) => Some(Ok(Event::default().data(json))),
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15)),
    )
}
