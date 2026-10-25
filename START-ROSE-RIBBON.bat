@echo off
cd /d "%~dp0"
echo Starting Rose and Ribbon...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-RoseRibbon.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Rose and Ribbon could not be started. See the message above.
  pause
  exit /b %RESULT%
)
echo.
echo Rose and Ribbon is open. The wallpaper is connected to the same schedule.
