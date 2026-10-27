@echo off
rem Double-click launcher for the netiOS Windows installer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-netios.ps1" %*
pause
