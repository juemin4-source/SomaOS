@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ── SomaOS 快速启动（免编译） ──
:: 需要先设好环境变量 DEEPSEEK_API_KEY

if "%DEEPSEEK_API_KEY%"=="" (
    echo [SomaOS] 错误：未设置 DEEPSEEK_API_KEY
    echo.
    echo 请先设置环境变量，例如：
    echo   set DEEPSEEK_API_KEY=sk-xxx
    echo.
    pause
    exit /b 1
)

:: 优先使用已编译的二进制
set BIN=%~dp0target\debug\soma.exe
if not exist "%BIN%" set BIN=%~dp0target\release\soma.exe

if exist "%BIN%" (
    "%BIN%" %*
) else (
    echo [SomaOS] 未找到编译好的 soma.exe，正在编译...
    cargo run --bin soma %*
)

endlocal
