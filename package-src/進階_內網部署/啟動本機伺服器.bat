@echo off
chcp 65001 >nul
title OpenHES Demo - 本機伺服器
echo 正在啟動 OpenHES Demo 本機伺服器...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo 伺服器已停止。
pause
