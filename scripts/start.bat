@echo off
REM Cross-platform launcher for Windows.
REM Uses the bundled Node runtime (.\node\node.exe) if present, else a system node.
setlocal enabledelayedexpansion

REM Resolve the directory this script lives in (the app root).
cd /d "%~dp0"

REM Pick a Node binary: bundled first, then PATH.
if exist "%~dp0node\node.exe" (
  set "NODE_BIN=%~dp0node\node.exe"
) else (
  where node >nul 2>&1
  if !errorlevel! equ 0 (
    set "NODE_BIN=node"
  ) else (
    echo 未找到 Node.js 运行时。请确保包完整，或安装 Node.js。
    pause
    exit /b 1
  )
)

set "SERVER_JS=%~dp0server\dist\server.js"
if not exist "%SERVER_JS%" (
  echo 找不到服务端程序: %SERVER_JS%
  pause
  exit /b 1
)

REM Find a free port starting from 3000.
set PORT=3000
:findport
netstat -ano | findstr ":!PORT! " | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
  set /a PORT+=1
  if !PORT! LSS 3100 goto findport
)

set CLAUDE_UI_ROOT=%~dp0
echo 正在启动 Claude Code WebUI (端口 !PORT!)...

start "" "!NODE_BIN!" "!SERVER_JS!"

REM Wait for the server to be ready, then open the browser.
set TRIES=0
:waitloop
set /a TRIES+=1
if !TRIES! GTR 60 goto openbrowser
ping -n 2 127.0.0.1 >nul
powershell -Command "try { (Invoke-WebRequest -Uri 'http://localhost:!PORT!/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if !errorlevel! neq 0 goto waitloop

:openbrowser
start "" "http://localhost:!PORT!"

REM Keep the window open so the server keeps running; closing it stops the app.
echo.
echo Claude Code WebUI 已启动，浏览器即将打开。
echo 关闭此窗口将停止服务。
echo.
pause
taskkill /im node.exe /f >nul 2>&1
endlocal
