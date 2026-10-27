@echo off
rem Double-click: hands a go.netia.pl browser session to netiOS on a webOS 4 TV, whose browser cannot run the official login.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-netios.ps1" -ImportSession %*
pause
