# Деплой в Railway (Client + Server)

Ниже — минимальная инструкция, как задеплоить монорепо в Railway с двумя
сервисами: `@romance/server` и `@romance/client`.

## 1) Подготовка репозитория

1. Закоммить и запушь репозиторий в GitHub.
2. Убедись, что у тебя есть 2 файла конфигурации:
   - `apps/server/railway.json`
   - `apps/client/railway.json`

Эти файлы Railway подхватывает как «Config as Code» для монорепозитория.

## 2) Создание проекта и сервисов

1. В Railway создай **New Project → Deploy from GitHub** и выбери репозиторий.
2. Railway распознаёт JS‑монорепо и может автоматически создать сервисы для
   пакетов workspace. Проверь, что созданы два сервиса:
   - `@romance/server`
   - `@romance/client`

Если сервисы не создались автоматически — создай их вручную и привяжи к
репозиторию.

## 3) Конфигурация сервисов (Config as Code)

### Server (`apps/server/railway.json`)

- **Build Command**: `pnpm -w --filter @romance/server... build`
- **Start Command**: `pnpm -C apps/server start`
- **Healthcheck**: `/ping`

### Client (`apps/client/railway.json`)

- **Build Command**: `pnpm -w --filter @romance/shared... build && pnpm -w --filter @romance/client... build`
- **Start Command**: `/bin/sh -c "pnpm -C apps/client preview -- --host 0.0.0.0 --port $PORT"`

> Примечание: `preview` использует уже собранные статические файлы из `dist`.

## 4) Переменные окружения

### Client

- `VITE_API_BASE_URL` — URL сервера, например: `https://<server>.up.railway.app`

### Server

- `PORT` Railway выставляет автоматически.

## 5) Деплой и проверка

1. Запусти деплой сервисов.
2. Открой URL клиента и убедись, что приложение загружается.
3. Проверь серверный healthcheck: `https://<server>.up.railway.app/ping`.

## 6) Если Railway не подхватил railway.json

В монорепо Railway Config File не «следует» за Root Directory. Если ты менял
Root Directory в настройках сервиса — укажи **абсолютный путь** к файлу конфигурации
(например, `/apps/server/railway.json`).

## 7) Если билд/старт не применяется

В редких случаях Railway может игнорировать команды из `railway.json`. Тогда
проставь команды вручную в Settings → Build / Deploy:

- **Build Command** для server: `pnpm -w --filter @romance/server... build`
- **Start Command** для server: `pnpm -C apps/server start`
- **Build Command** для client: `pnpm -w --filter @romance/shared... build && pnpm -w --filter @romance/client... build`
- **Start Command** для client: `/bin/sh -c "pnpm -C apps/client preview -- --host 0.0.0.0 --port $PORT"`
