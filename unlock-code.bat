@echo off
echo ========================================================
echo       UNLOCKING SOURCE CODE FILES (PASSWORD: siva)
echo ========================================================
set /p PASS=Enter password: 
if "%PASS%"=="" set PASS=siva
node scripts\securityManager.js unlock %PASS%
echo.
pause
