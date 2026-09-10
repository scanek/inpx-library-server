#!/usr/bin/env bash
set -e

echo "========================================================"
echo " INPX Library Server - Docker Build Utility"
echo "========================================================"
echo ""

if ! command -v docker &> /dev/null; then
  echo "[ERROR] Docker executable not found in PATH."
  echo "Please install Docker or start the Docker daemon."
  exit 1
fi

echo "1. Building Standalone Image (scanek/inpx-library-server:latest)..."
docker build -t scanek/inpx-library-server:latest .
echo "[OK] Standalone image built successfully."
echo ""

echo "2. Building Nginx-cached Stack (tools/docker-compose.nginx.yml)..."
docker compose -f tools/docker-compose.nginx.yml build
echo "[OK] Nginx stack built successfully."
echo ""

echo "========================================================"
echo " Both Docker setups built successfully!"
echo "  - Standalone: docker compose up -d"
echo "  - Nginx-cached: docker compose -f tools/docker-compose.nginx.yml up -d"
echo "========================================================"
