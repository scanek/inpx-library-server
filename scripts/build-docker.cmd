@echo off
setlocal
echo ========================================================
echo  INPX Library Server - Docker Build Utility
echo ========================================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Docker executable not found in PATH.
  echo Please make sure Docker Desktop or Docker Engine is installed and running.
  echo.
  pause
  exit /b 1
)

echo 1. Building Standalone Image (scanek/inpx-library-server:latest)...
docker build -t scanek/inpx-library-server:latest .
if %errorlevel% neq 0 (
  echo [ERROR] Standalone image build failed!
  pause
  exit /b %errorlevel%
)
echo [OK] Standalone image built successfully.
echo.

echo 2. Building Nginx-cached Stack (tools/docker-compose.nginx.yml)...
docker compose -f tools/docker-compose.nginx.yml build
if %errorlevel% neq 0 (
  echo [ERROR] Nginx-cached stack build failed!
  pause
  exit /b %errorlevel%
)
echo [OK] Nginx stack built successfully.
echo.

echo ========================================================
echo  Both Docker setups built successfully!
echo   - Standalone: docker compose up -d
echo   - Nginx-cached: docker compose -f tools/docker-compose.nginx.yml up -d
echo ========================================================
echo.
pause
