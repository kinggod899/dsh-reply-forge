@echo off
chcp 936 >nul
cd /d "%~dp0"
echo ============================================
echo   dsh-reply-forge 一键重装
echo   （请先完全退出 DSH 桌面端再运行）
echo ============================================
echo.

rem 提醒：dsh 未退出时 pnpm 会因子文件占用而清空失败
rem ---- 路径配置（环境变量驱动，不写死本机路径） ----
rem DSH 桌面端安装目录（含 resources\app.asar\dsh\node.exe 的那层）。
rem 未设置时跳过「宿主自带 node」候选，node 仍可能从 PATH 找到。
if not defined DSH_APP_DIR echo [提示] 未设置 DSH_APP_DIR，将跳过宿主自带 node 候选。
rem dsh 家目录：默认 %USERPROFILE%\.dsh，可用 DSH_HOME 覆盖。
if not defined DSH_HOME set "DSH_HOME=%USERPROFILE%\.dsh"
set "PROFILE_DIR=%DSH_HOME%\profiles\desktop"
rem -------------------------------------------------

tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if "%ERRORLEVEL%"=="0" (
  echo [警告] 检测到 DSH 桌面端仍在运行。
  echo         请先完全退出 DSH（含托盘图标），再重新运行本脚本。
  echo.
  pause
  exit /b 1
)

set "NODE="
where node >nul 2>&1 && set "NODE=node"
if "%NODE%"=="" (
  if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
)
if "%NODE%"=="" (
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)
if "%NODE%"=="" (
  if exist "%DSH_APP_DIR%\resources\app.asar\dsh\node.exe" set "NODE=%DSH_APP_DIR%\resources\app.asar\dsh\node.exe"
)

if "%NODE%"=="" (
  echo [错误] 未找到 node.exe。
  echo 请手动执行：cd /d "%PROFILE_DIR%" ^&^& pnpm install
  echo.
  pause
  exit /b 1
)

"%NODE%" "%~dp0scripts\reinstall.mjs"
echo.
pause
