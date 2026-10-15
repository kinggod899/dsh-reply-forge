@echo off
chcp 936 >nul
cd /d "%~dp0"
echo ============================================
echo   dsh-reply-forge 一键关闭
echo ============================================
echo.

rem ---- 路径配置（环境变量驱动，不写死本机路径） ----
rem DSH 桌面端安装目录（含 resources\app.asar\dsh\node.exe 的那层）。
rem 未设置时跳过「宿主自带 node」候选，node 仍可能从 PATH 找到。
if not defined DSH_APP_DIR echo [提示] 未设置 DSH_APP_DIR，将跳过宿主自带 node 候选。
rem dsh 家目录：默认 %USERPROFILE%\.dsh，可用 DSH_HOME 覆盖。
if not defined DSH_HOME set "DSH_HOME=%USERPROFILE%\.dsh"
set "PROFILE_DIR=%DSH_HOME%\profiles\desktop"
rem -------------------------------------------------

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
  echo [错误] 未找到 node.exe，无法自动执行。
  echo 请手动完成以下三步：
  echo   1. 编辑 %PROFILE_DIR%\package.json
  echo      删除 dependencies 里的 "@local/dsh-reply-forge"
  echo      删除 dsh.profile.bundles 里的 "@local/dsh-reply-forge"
  echo   2. 编辑同目录 cordis.patch.yml，删除 id: dsh-reply-forge 的条目
  echo   3. 执行 rmdir "%PROFILE_DIR%\node_modules\@local\dsh-reply-forge"
  echo.
  pause
  exit /b 1
)

"%NODE%" "%~dp0scripts\disable.mjs"
echo.
echo 若上方显示已完成，请重启 DSH 桌面端。
pause
