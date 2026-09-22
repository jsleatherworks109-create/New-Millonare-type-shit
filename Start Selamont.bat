@echo off
title Selamont
cd /d "%~dp0"
if not exist node_modules (
  echo Installing for the first time, this takes a minute...
  call npm install
)
echo.
echo  Selamont is starting. Your browser will open at http://localhost:5173
echo  Keep this window open while you use it. Close it to stop.
echo.
call npm start
pause
