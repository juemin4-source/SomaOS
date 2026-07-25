#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Compiling..."
cargo build -p soma-runtime -p soma-tui
export PATH="$PWD/target/debug:$PATH"
echo "Starting SomaOS TUI..."
exec cargo run -p soma-tui
