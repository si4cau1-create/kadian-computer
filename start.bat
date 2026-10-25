@echo off
rem 卡点 · 一键启动（Windows）
rem 启动局域网静态服务器，手机同 WiFi 可访问并安装到主屏幕
chcp 65001 >nul
cd /d %~dp0
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 没有找到 python，请先安装 Python 3.8+ 并加入 PATH
  pause
  exit /b 1
)
python tools\serve.py %1
pause
