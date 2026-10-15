@echo off
chcp 936 >nul
cd /d "%~dp0"
echo ============================================
echo   dsh-reply-forge 一键关闭
echo ============================================
echo.

set "NODE="
where node >nul 2>&1 && set "NODE=node"
if "%NODE%"=="" (
  if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
)
if "%NODE%"=="" (
  if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)
if "%NODE%"=="" (
  if exist "E:\game\DeepSeekHarness\resources\app.asar\dsh\node.exe" set "NODE=E:\game\DeepSeekHarness\resources\app.asar\dsh\node.exe"
)

if "%NODE%"=="" (
  echo [错误] 未找到 node.exe，无法自动执行。
  echo 请手动完成以下三步：
  echo   1. 编辑 C:\Users\Administrator\.dsh\profiles\desktop\package.json
  echo      删除 dependencies 里的 "@local/dsh-reply-forge"
  echo      删除 dsh.profile.bundles 里的 "@local/dsh-reply-forge"
  echo   2. 编辑同目录 cordis.patch.yml，删除 id: dsh-reply-forge 的条目
  echo   3. 执行 rmdir "C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\dsh-reply-forge"
  echo.
  pause
  exit /b 1
)

"%NODE%" "%~dp0scripts\disable.mjs"
echo.
echo 若上方显示已完成，请重启 DSH 桌面端。
pause
