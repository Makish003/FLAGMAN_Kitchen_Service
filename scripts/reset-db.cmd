@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset-db.ps1" %*
exit /b %errorlevel%
