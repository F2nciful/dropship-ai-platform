@echo off
echo ============================================
echo   Stopping Nexus Platform
echo ============================================
echo.
echo WARNING: this stops ALL Node.js and Python
echo processes on this PC, not just Nexus - close
echo any other Node/Python apps first if you don't
echo want them killed too.
echo.
pause

echo.
echo Stopping Backend + Frontend (Node.js)...
taskkill /F /IM node.exe /T >nul 2>&1

echo Stopping Ollama...
taskkill /F /IM ollama.exe /T >nul 2>&1
taskkill /F /IM ollama_llama_server.exe /T >nul 2>&1

echo Stopping FastAPI / Uvicorn (Python)...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM pythonw.exe /T >nul 2>&1
taskkill /F /IM uvicorn.exe /T >nul 2>&1

echo.
echo ============================================
echo   All Nexus services have been stopped.
echo ============================================
echo.
pause
