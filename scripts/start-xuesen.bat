@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
node "%SCRIPT_DIR%dev-services.mjs" start %*
if errorlevel 1 pause
exit /b %ERRORLEVEL%
