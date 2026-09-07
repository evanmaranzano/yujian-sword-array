@echo off
rem 隔空御剑 · 万剑归宗（Web 版）一键启动（开发/演示用；正式 kiosk 见 docs/04 部署章）
cd /d %~dp0

rem 仅绑定本机回环，避免局域网可访问（docs/03 H3）
set BIND=--bind 127.0.0.1

rem 端口被占用时自动顺延到 8001/8002
set PORT=8000
if exist ..\.venv\Scripts\python.exe (
  set PY=..\.venv\Scripts\python.exe
) else (
  set PY=python
)
start /b %PY% -m http.server %PORT% %BIND%
timeout /t 1 /nobreak >nul

rem 自动探测浏览器：Edge 优先（多数展厅机无 Chrome），回退 Chrome、系统默认
set BROWSER=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if defined BROWSER (
  start "" "%BROWSER%" --start-fullscreen --autoplay-policy=no-user-gesture-required http://127.0.0.1:%PORT%/
) else (
  start "" http://127.0.0.1:%PORT%/
)
