@echo off
chcp 65001 >nul
title OpenHES Demo - 製作部署包
echo 正在製作 OpenHES Demo 安裝部署包...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0製作部署包.ps1"
echo.
pause
