@echo off
setlocal
title Endless Browser Launcher
color 0B

echo.
echo  ============================================
echo    ENDLESS BROWSER - Startup Script
echo  ============================================
echo.

:: ── Step 0: Check Dependencies ──
echo  [0/3] Checking Dependencies...

where java >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Java not found! Please install JDK 17+.
    goto :fail
)

where mvn >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Maven not found! Please install Maven.
    goto :fail
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Node.js not found! Please install Node.js.
    goto :fail
)

echo  OK - Java, Maven, Node.js found.
echo.

:: ── Step 1: Start Ollama AI Server ──
echo  [1/3] Starting Local AI (Ollama)...
netstat -ano 2>nul | findstr "11434" >nul 2>&1
if %errorlevel% neq 0 (
    where ollama >nul 2>&1
    if %errorlevel% neq 0 (
        echo  WARNING: Ollama not found. AI features may not work.
        echo           Install from https://ollama.com
    ) else (
        echo  Starting Ollama server...
        start "Ollama AI Server" /min cmd /c "ollama serve"
        echo  Waiting for Ollama to initialize...
        timeout /t 5 /nobreak >nul
    )
) else (
    echo  OK - Ollama is already running on port 11434.
)
echo.

:: ── Step 2: Check MySQL and Start Backend ──
echo  [2/3] Checking MySQL and Starting Backend...
netstat -ano 2>nul | findstr "3306" >nul 2>&1
if %errorlevel% neq 0 (
    color 0E
    echo  WARNING: MySQL port 3306 not detected.
    echo           Make sure MySQL is running.
    color 0B
)

:: Kill any existing process on port 8082
echo  Cleaning up port 8082...
netstat -ano | findstr "8082" | findstr "LISTENING" > "%TEMP%\gravity_port.txt" 2>nul
for /f "tokens=5" %%a in (%TEMP%\gravity_port.txt) do taskkill /pid %%a /f >nul 2>&1
del "%TEMP%\gravity_port.txt" >nul 2>&1

echo  Starting Spring Boot backend...
start "Endless Backend" cmd /c "cd /d %~dp0 && mvn spring-boot:run -DskipTests"

echo  Waiting for backend to initialize (20 seconds)...
timeout /t 20 /nobreak >nul

netstat -ano 2>nul | findstr "8082" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  Backend is ready on port 8082!
) else (
    echo  Backend may still be loading. Continuing anyway...
)
echo.

:: ── Step 3: Start Electron Frontend ──
echo  [3/3] Starting Frontend (Electron)...
if exist "%~dp0electron-app" (
    if not exist "%~dp0electron-app\node_modules" (
        echo  Installing npm dependencies first...
        cd /d "%~dp0electron-app"
        call npm install
    )
    echo  Launching Electron app...
    start "Endless Frontend" cmd /c "cd /d %~dp0electron-app && npm start"
) else (
    color 0C
    echo  ERROR: electron-app directory not found!
    goto :fail
)

echo.
echo  ============================================
echo    All services launched successfully!
echo  ============================================
echo.
echo    Backend:  http://localhost:8082
echo    Ollama:   http://localhost:11434
echo.
echo    Tips:
echo    - Press Ctrl+K for Command Palette
echo    - Type /do to automate web tasks
echo    - Type /summarize to summarize a page
echo.
echo  Press any key to close this launcher window...
pause >nul
exit /b 0

:fail
echo.
echo  ============================================
echo    STARTUP FAILED - See error above.
echo  ============================================
echo.
echo  Press any key to close...
pause >nul
exit /b 1
