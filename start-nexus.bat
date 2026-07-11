@echo off
setlocal

set "ROOT=%~dp0"

echo ============================================
echo   Starting Nexus Platform
echo ============================================
echo.

echo [1/4] Starting Ollama (127.0.0.1:11435)...
start "Ollama" cmd /k "set OLLAMA_HOST=127.0.0.1:11435 && ollama serve"
timeout /t 3 /nobreak >nul

echo [2/4] Starting Backend (Express, port 5000)...
start "Backend" cmd /k "cd /d "%ROOT%backend" && npm start"
timeout /t 3 /nobreak >nul

echo [3/4] Starting FastAPI Product Research Agent (port 8000)...
start "FastAPI" cmd /k "cd /d "%ROOT%product-research-agent" && call venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul

echo [4/4] Starting Frontend (React, port 3000)...
start "Frontend" cmd /k "cd /d "%ROOT%frontend\dashboard" && npm start"

echo.
echo ============================================
echo   All Nexus services are launching!
echo.
echo   Ollama    - http://127.0.0.1:11435
echo   Backend   - http://localhost:5000
echo   FastAPI   - http://127.0.0.1:8000/docs
echo   Frontend  - http://localhost:3000
echo.
echo   Four windows just opened (Ollama, Backend,
echo   FastAPI, Frontend) - keep them open, they
echo   are your running servers.
echo.
echo   Wait about 30 seconds for everything to
echo   finish starting, then open:
echo.
echo       http://localhost:3000
echo.
echo   To stop everything later, run stop-nexus.bat
echo ============================================
echo.
pause
