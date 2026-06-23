@echo off
REM ============================================================
REM  Moov Service Network - one-click launcher (Windows)
REM  Double-click this file to install (first run) and start the
REM  app. Runs via Command Prompt, so it is not affected by the
REM  PowerShell script-execution policy. Keep the window open
REM  while you use the app; close it to stop.
REM ============================================================
title Moov Service Network
cd /d "%~dp0"

echo Installing/updating dependencies (first run can take a minute)...
call npm.cmd run setup
if errorlevel 1 (
  echo.
  echo Setup failed - please copy the messages above and send them over.
  echo Press any key to close.
  pause >nul
  exit /b 1
)

echo.
echo Starting the app. Your browser will open in about 10 seconds.
echo KEEP THIS WINDOW OPEN while you use the app. Close it to stop.
echo.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:5173"
call npm.cmd run dev:all
