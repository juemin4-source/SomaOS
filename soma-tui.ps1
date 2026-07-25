#!/usr/bin/env pwsh
<#
.SYNOPSIS
    SomaOS TUI 启动器 — 先编译再启动
.DESCRIPTION
    在项目根目录编译并运行 soma-tui。
#>

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "Compiling..." -ForegroundColor Cyan
cargo build -p soma-runtime -p soma-tui
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

$env:PATH = "$ProjectRoot/target/debug;$env:PATH"

Write-Host "Starting SomaOS TUI..." -ForegroundColor Green
cargo run -p soma-tui
