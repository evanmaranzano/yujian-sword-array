@echo off
rem v4 重构一键验证（语法/单测/Python 回归/无头截图/交付文档）
cd /d %~dp0..
where bash >nul 2>nul && (bash tools/verify_v4.sh & pause & exit /b)
echo 未找到 Git Bash，请在 Git Bash 中执行: bash tools/verify_v4.sh
pause
