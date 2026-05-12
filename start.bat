@echo off
title Marketplace R45
color 0A

echo.
echo  ██████╗ ██╗  ██╗███████╗
echo  ██╔══██╗██║  ██║██╔════╝
echo  ██████╔╝███████║███████╗
echo  ██╔══██╗╚════██║╚════██║
echo  ██║  ██║     ██║███████║
echo  ╚═╝  ╚═╝     ╚═╝╚══════╝
echo.
echo  Marketplace R45 — Arbitraje Inteligente
echo  ========================================
echo.

:: Verificar Python
python --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo [ERROR] Python no esta instalado.
    echo         Descargalo desde https://www.python.org/downloads/
    echo         Al instalar, tildar "Add Python to PATH"
    pause
    exit /b 1
)

echo [1/3] Instalando dependencias...
cd /d "%~dp0backend"
python -m pip install -r requirements.txt --quiet
IF ERRORLEVEL 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

echo [2/3] Verificando .env...
IF NOT EXIST ".env" (
    echo [AVISO] No se encontro backend\.env
    IF EXIST ".env.example" copy ".env.example" ".env" >nul
    echo         Completá las claves en backend\.env y volvé a ejecutar.
    pause
    exit /b 1
)

echo [3/3] Iniciando servidor...
echo.
echo  ========================================
echo  Todo en un solo puerto:
echo  http://localhost:8000        (frontend)
echo  http://localhost:8000/docs   (API docs)
echo  ========================================
echo.
echo  [Ctrl+C para detener]
echo.

:: Abrir navegador despues de 3 segundos
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8000"

:: Arrancar desde la carpeta api/ para que mercadolibre.py sea encontrable
cd /d "%~dp0backend\api"
python -m uvicorn api:app --reload --port 8000

pause
