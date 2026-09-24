<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="INPX Library Server — self-hosted ebook library: search, browser reading, OPDS, send to device">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d4ac5c?style=flat-square&labelColor=1e1a16" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-9a8e7e?style=flat-square&labelColor=1e1a16" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/docker-ready-7a5a28?style=flat-square&labelColor=1e1a16" alt="Docker ready">
  <img src="https://img.shields.io/badge/OPDS-1.x-3d4a5c?style=flat-square&labelColor=1e1a16" alt="OPDS 1.x">
  <img src="https://img.shields.io/badge/version-2.6.4-a1671b?style=flat-square&labelColor=1e1a16" alt="Version 2.6.4">
</p>

**INPX Library Server** — self-hosted веб-сервер для электронных библиотек на базе INPX/FB2. Каталог, поиск, чтение в браузере, OPDS для KOReader и отправка книг на Kindle/Kobo по почте — на NAS, Raspberry Pi или обычном ПК.

---

## Ключевые улучшения и оптимизации

- ⚡ **Новый компактный режим («Список» / List View)**: удобный переключатель отображения «Сетка» 🔲 / «Список» ☰. Снижает нагрузку на DOM и процессор устройства в 2–3 раза. Плавный скролл длинных каталогов (сотни книг) без лагов даже на слабых устройствах и E-Ink читалках.
- ⚡ **Действия в 1 клик прямо из списка**: кнопки «Читать» и «Скачать FB2/EPUB» доступны сразу в строке книги — без необходимости переходить на отдельную страницу.
- ⚡ **Бесшовные переходы (View Transitions API)**: мгновенная смена страниц каталога без мерцания и белых вспышек; плавность работы сопоставима с нативным мобильным приложением.
- 📱 **Эргономичная Touch-навигация**: обновленный нижний бар для смартфонов с векторными иконками, увеличенными областями касания (стандарт 48px) и поддержкой `safe-area-inset` для безрамочных экранов.
- 📚 **«Всеядная» авто-детекция раздач (RuTracker / любые коллекции)**:
  - Автоматический поиск `.inpx` файлов в любых подпапках раздачи.
  - Нечувствительность к регистру (`.inpx` / `.INPX`).
  - Приоритет локальных баз (`_local.inpx`).
  - Полная поддержка архивов `.zip` и `.7z`, а также подтягивание обложек (`covers/`) и описаний (`annotations/`).
- 🐳 **Готовые Docker-образы в GHCR**: автоматический CI/CD и публикация multi-arch образов (`ghcr.io/scanek/inpx-library-server:latest`). Очищенный `docker-compose.yml` без лишних конфликтующих томов.

---

<p align="center">
  <img src="./assets/readme/features.svg" width="100%" alt="Capabilities: Search, Reader, Delivery, Clients">
</p>

## Возможности

| | |
|---|---|
| **Каталог** | Полнотекстовый поиск, авторы / серии / жанры, фильтры, карточка книги с обложкой и похожими |
| **Форматы** | FB2, EPUB, MOBI, AZW3 · архивы ZIP/7z · несколько источников сразу |
| **Читалка** | HTML5 для FB2/EPUB, темы, шрифты, закладки, позиция, TTS, «Продолжить» |
| **Персональное** | Избранное (книги, авторы, серии), полки, рекомендации |
| **Выдача** | Скачивание и пакетный ZIP · конвертация через [fb2cng](https://github.com/rupor-github/fb2cng) · email на ридер |
| **OPDS** | `/opds` для KOReader, Moon+, Librera, FBReader · Basic Auth · OpenSearch |
| **Sidecar** | Обложки Flibusta/FLibrary (в т.ч. JXL), рецензии, биографии, портреты |
| **Админка** | Источники, пользователи, SMTP, Telegram-бот, OIDC/SSO, дубликаты, логи, бэкап, обновление из ZIP |
| **Безопасность** | Сессии, CSRF, rate limit, шифрование SMTP-пароля, настраиваемый анонимный доступ |

Интерфейс **RU · EN**. Кластерный режим и health-checks (`/health`, `/ready`) для продакшена.

---

<p align="center">
  <img src="./assets/readme/architecture.svg" width="100%" alt="Architecture: sources to SQLite index to Web, OPDS, Android">
</p>

Метаданные книг живут в индексе и отдаются через `/api/*` — один контракт для веба, OPDS и Android-ридера.

---

## Быстрый старт

### Требования

- **Node.js 20+** (на Windows `install.cmd` ставит портативный Node 24; на Linux `install.sh` — Node 20)
- Папка с книгами или INPX-архивами (`.inpx` + `.zip` / `.7z`, либо каталог с FB2/EPUB)

### Windows

1. Скачайте [релиз ZIP](https://github.com/scanek/inpx-library-server/releases/latest) и распакуйте **или** клонируйте:
   ```bash
   git clone https://github.com/scanek/inpx-library-server.git
   cd inpx-library-server
   ```
2. Запустите **`install.cmd`** — скачает портативный Node.js и установит зависимости (включая конвертер).
3. При необходимости создайте `.env` из `.env.example` и укажите путь к книгам, например:
   ```env
   LIBRARY_ROOT=D:\Books
   ```
4. Запустите **`start-server.cmd`** → откройте http://localhost:3000  
   Остановка: `stop-server.cmd` · перезапуск: `restart-server.cmd`

Первый вход: **admin / admin** — сразу смените пароль в профиле.

### Linux (Debian / Ubuntu / Raspbian / OpenMediaVault)

```bash
git clone https://github.com/scanek/inpx-library-server.git
cd inpx-library-server
chmod +x install.sh start.sh stop.sh restart.sh
sudo ./install.sh    # Node.js, зависимости; предложит systemd
./start.sh
```

Откройте http://localhost:3000 → **admin / admin**.

```bash
# если включили systemd при установке
sudo systemctl start inpx-library
sudo systemctl status inpx-library
sudo journalctl -u inpx-library -f
```

### macOS

```bash
chmod +x install.sh start.sh
sudo ./install.sh    # нужны Xcode Command Line Tools и Node (Homebrew или pkg с nodejs.org)
./start.sh
```

### Docker (готовый образ)

```bash
docker pull ghcr.io/scanek/inpx-library-server:latest

docker run -d \
  --name inpx-library \
  --restart unless-stopped \
  -p 3000:3000 \
  -v inpx-data:/app/data \
  -v /path/to/library:/library:ro \
  -e LIBRARY_ROOT=/library \
  ghcr.io/scanek/inpx-library-server:latest
```

Откройте http://localhost:3000. Доп. источники:

```bash
-v /path/to/epub:/sources/epub:ro
```

Затем в админке: **Источники → Добавить → тип «Папка» → путь `/sources/epub`**.

### Сборка образа из исходников

```bash
docker build -t inpx-library .
docker run -d --name inpx-library -p 3000:3000 \
  -v inpx-data:/app/data \
  -v /path/to/library:/library:ro \
  -e LIBRARY_ROOT=/library \
  inpx-library
```

<details>
<summary><strong>Docker Compose (рекомендуемый запуск)</strong></summary>

В корне репозитория уже есть готовый `docker-compose.yml`:

```yaml
services:
  library:
    image: ghcr.io/scanek/inpx-library-server:latest
    container_name: inpx-library
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - /path/to/library:/library:ro
    environment:
      - PORT=3000
      - LIBRARY_ROOT=/library
```

Запуск / обновление:
```bash
docker compose pull
docker compose up -d
```
</details>

<details>
<summary><strong>Synology NAS (Container Manager)</strong></summary>

В репозитории уже есть `docker-compose.yml` под Synology:

- образ: `ghcr.io/scanek/inpx-library-server:latest`
- порт **3000** (открывайте `http://NAS-IP:3000`)
- данные: bind-mount `/volume1/docker/inpx-library-data` → `/app/data`

1. Создайте папку данных: `mkdir -p /volume1/docker/inpx-library-data`
2. В compose укажите том с книгами, например:
   ```yaml
   - /volume1/books/library:/library:ro
   ```
3. **Container Manager → Проект → Создать**, укажите папку с `docker-compose.yml` → **Применить**
4. Откройте `http://NAS-IP:3000` → **admin / admin**

Образ: **amd64** и **arm64**. Healthcheck идёт через `curl` (на слабых NAS Node-проверка часто не успевает).
</details>

---

## После установки

1. Войдите как **admin / admin** и смените пароль.
2. В админке добавьте **источник** — папка с `.inpx`/архивами или каталог с файлами книг.
3. Дождитесь индексации (минуты… ~45 мин на большой библиотеке). Статус — в админке.
4. Язык интерфейса — **RU · EN** в шапке.
5. SMTP для отправки на ридер — админка → почта / SMTP.
6. Бэкап БД — админка → Операции → «Скачать бэкап» (или файл `data/library.db`).

**Продакшен за HTTPS / reverse proxy:** задайте `TRUST_PROXY=true` и `SESSION_SECURE_COOKIE=true` (см. `.env.example`).

---

## OPDS

Адрес: **`/opds`**. Аутентификация — Basic Auth (логин и пароль пользователя библиотеки). Подходит для KOReader, Moon+ Reader, Librera, FBReader.

Анонимный OPDS можно включить в админке → Пользователи → «Анонимный доступ».

## API

Ошибки JSON содержат стабильное поле `code` (например `UNAUTHORIZED`) и локализованное `error`. Клиентам следует ориентироваться на `code`.

Ключевые маршруты для Android-ридера: `GET /api/books/:id/meta`, позиция чтения (`position` + CAS `revision`), sync закладок/заметок, `GET /api/search`, `GET /api/catalog`.

---

<details>
<summary><strong>Переменные окружения</strong></summary>

Шаблон: [`.env.example`](.env.example). Скопируйте в `.env` и правьте.

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт сервера |
| `LIBRARY_ROOT` | `/library` | Путь к папке с книгами (на Windows укажите свой диск) |
| `INPX_FILE` | — | Путь к `.inpx` (иначе задаётся в админке) |
| `SESSION_SECRET` | авто | Секрет cookie (≥16 символов или файл `data/.session-secret`) |
| `SESSION_SECURE_COOKIE` | `false` | `true` для HTTPS |
| `SESSION_MAX_AGE_MS` | `1209600000` | TTL сессии (14 дней) |
| `LOGIN_WINDOW_MS` | `900000` | Окно rate limit входа |
| `LOGIN_MAX_ATTEMPTS` | `10` | Макс. неудачных попыток |
| `TRUST_PROXY` | `false` | `true` за nginx / Caddy |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | — | SMTP для отправки на ридер |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Учётные данные SMTP |
| `FB2CNG_PATH` | `./converter/fbc` | Бинарник fb2cng |
| `FB2CNG_CONFIG_PATH` | `./converter/fb2cng.yaml` | Конфиг конвертера |
| `SEVEN_ZIP_PATH` | npm `7zip-bin` | Путь к 7z |
| `COVER_MAX_WIDTH` | `220` | Ширина миниатюры |
| `COVER_MAX_HEIGHT` | `320` | Высота миниатюры |
| `COVER_QUALITY` | `86` | Качество WebP |
| `SCAN_INTERVAL_HOURS` | `0` | Автоскан каждые N часов (0 = выкл.) |
| `EVENTS_STDOUT` | `true` | События в stdout (`docker logs`) |
| `HEALTH_MINIMAL` | `false` | Минимальный `/health` |
| `CLUSTER_WORKERS` | `0` | Воркеры кластера (0 = один процесс) |
| `TELEGRAM_BOT_TOKEN` | — | Токен бота (или настройка в админке) |
| `PERF_PROFILE` | авто | `default` / `embedded` для NAS / мало RAM |

OIDC / SSO (Authentik и совместимые) включается в админке: **Users → OIDC / SSO** (по умолчанию выключен).
</details>

<details>
<summary><strong>Устранение неполадок</strong></summary>

- **Не отвечает:** `curl -sS http://127.0.0.1:3000/health` → в ответе должно быть `"ok":true`.
- **Порт занят:** смените `PORT` в `.env` или проброс портов в Docker.
- **Медленный старт:** во время индексации задержки нормальны.
- **Нет книг:** источник добавлен в админке и индексация завершена?
- **Windows: пустой каталог:** проверьте `LIBRARY_ROOT` в `.env` (например `D:\Books`).
- **Конвертация:** после `install.cmd` / `install.sh` должен появиться `converter/fbc` (`fbc.exe` на Windows).
- **Сброс пароля admin:** `reset-admin.cmd` (Windows) или `./reset-admin.sh` (Linux/macOS).
</details>

---

## Лицензия

**[MIT](LICENSE)**
