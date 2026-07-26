//! # workspace — 工作区检测模块
//!
//! 提供 TUI 启动前的工作区上下文检测能力：
//! - Git 仓库状态（branch, dirty, changed files）
//! - 项目类型（Rust / TypeScript / Python / Go）
//! - 构建工具（Cargo / npm / pip）
//! - 权限模式
//!
//! ## 结构
//! - `context.rs` — WorkspaceContext 类型定义
//! - `detect.rs` — detect_workspace() 实现

pub mod context;
pub mod detect;

pub use context::*;
pub use detect::detect_workspace;
