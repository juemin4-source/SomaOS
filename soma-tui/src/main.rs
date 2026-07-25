//! # SomaOS TUI — 独立入口点
//!
//! 通过 `soma-client` 连接 Runtime，用 `eye_declare::driver_tokio` 驱动 TUI。
//! 也可以从 `soma` 命令行启动（无子命令时）。

use std::io;

fn main() -> io::Result<()> {
    soma_tui::run()
}
