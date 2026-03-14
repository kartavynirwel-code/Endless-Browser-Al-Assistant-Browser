@echo off
echo =========================================
echo    STARTING ENDLESS BROWSER
echo =========================================

echo.
echo [1/3] Starting Local AI (Ollama)...
start "Ollama AI Server" cmd /c "ollama serve"
timeout /t 3 /nobreak >nul

echo.
echo [2/3] Cleaning up old Backend processes...
powershell -Command "try { $pId = (Get-NetTCPConnection -LocalPort 8082 -ErrorAction Stop).OwningProcess; Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue } catch { }"
echo [2/3] Starting Backend (Spring Boot)...
start "Gravity Backend" cmd /c "mvn spring-boot:run -DskipTests"
timeout /t 15 /nobreak >nul

echo.
echo [3/3] Starting Frontend (Electron)...
cd electron-app
start "Gravity Frontend" cmd /c "npm start"

echo.
echo =========================================
echo    All services launched!
echo    You can now close this window.
echo =========================================
timeout /t 5 >nul
exit
