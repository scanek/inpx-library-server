#!/usr/bin/env bash
set -e

echo "=============================================================================="
echo "  INPX Library Server - Установка и запуск через Docker"
echo "=============================================================================="
echo ""

if ! command -v docker &> /dev/null; then
  echo "[ОШИБКА] Docker не найден в системе."
  echo "Пожалуйста, установите Docker: https://docs.docker.com/engine/install/"
  exit 1
fi

if [ ! -d "books" ]; then
  echo "[ИНФО] Создаю папку ./books для книг..."
  mkdir -p books
fi

echo "[ИНФО] Запуск сборки и поднятия контейнеров..."
echo "Команда: docker compose -f docker-compose.install.yml up -d --build"
echo ""

docker compose -f docker-compose.install.yml up -d --build

echo ""
echo "=============================================================================="
echo "  [УСПЕХ] Сервер библиотеки успешно установлен и запущен!"
echo ""
echo "  Адрес:    http://localhost:3000"
echo "  Логин:    admin"
echo "  Пароль:   admin"
echo ""
echo "  Для добавления книг поместите ваши файлы/архивы в папку:"
echo "    $(pwd)/books"
echo "=============================================================================="
