@echo off
chcp 65001 >nul
setlocal

:: ── SomaOS 启动（编译+运行） ──
:: 需要先设好环境变量 DEEPSEEK_API_KEY 或 ANTHROPIC_API_KEY

if "%DEEPSEEK_API_KEY%"=="" if "%ANTHROPIC_API_KEY%"=="" (
    echo [SomaOS] 错误：未设置 API Key
    echo.
    echo 请先设置环境变量，例如：
    echo   set DEEPSEEK_API_KEY=sk-xxx
    echo.
    echo 或运行 `soma doctor` 查看诊断信息。
    pause
    exit /b 1
)

cargo run --bin soma %*

endlocal
