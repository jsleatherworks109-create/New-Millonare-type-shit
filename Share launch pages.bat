@echo off
title Selamont - public launch pages
cd /d "%~dp0"
if not exist node_modules call npm install
echo.
echo  Building and opening a free public link for your launch pages...
echo  Only /d/your-drop pages are shared. Your tools stay private.
echo  Keep this window open during a launch. Close it to stop sharing.
echo.
call npm run share
pause
