@echo off
setlocal enabledelayedexpansion
echo ==============================================================================
echo   INPX Library Server - Установка и запуск через Docker
echo ==============================================================================
echo.

where docker >nul 2>nul
if %errorlevel% neq 0 (
  echo [ОШИБКА] Docker не найден в системе.
  echo Пожалуйста, установите и запустите Docker Desktop: https://www.docker.com/products/docker-desktop/
  echo.
  pause
  exit /b 1
)

if not exist books (
  echo [ИНФО] Создаю папку ./books для ваших книг...
  mkdir books
)

echo [ИНФО] Запуск сборки и поднятия контейнеров...
echo Команда: docker compose -f docker-compose.install.yml up -d --build
echo.

docker compose -f docker-compose.install.yml up -d --build

if %errorlevel% neq 0 (
  echo.
  echo [ОШИБКА] Не удалось запустить контейнер. Проверьте вывод выше.
  pause
  exit /b %errorlevel%
)

echo.
echo ==============================================================================
echo   [УСПЕХ] Сервер библиотеки успешно установлен и запущен!
echo.
echo   Адрес:    http://localhost:3000
echo   Логин:    admin
echo   Пароль:   admin
echo.
echo   Для добавления книг поместите ваши файлы/архивы в папку:
echo     %CD%\books
echo ==============================================================================
echo.
pause
