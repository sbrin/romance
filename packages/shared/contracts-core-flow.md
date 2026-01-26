# Core Flow Contracts (P0-01..P0-03)

Эта спецификация описывает минимальные HTTP/WS контракты для Core Flow.

## Shared Types

### deviceId

- string, min length 8 (рекомендуем UUID).
- Должен быть стабильным между перезагрузками (хранить в localStorage).
- Используется и в HTTP, и в Socket.io auth.

### role

- `'MALE' | 'FEMALE'`
- Маппинг UI:
  - "Мужчина" → `MALE`
  - "Женщина" → `FEMALE`

## Recommended Client Flow (P0-01..P0-03)

1. Сгенерировать `deviceId` один раз и сохранить локально.
2. Подключиться к Socket.io с auth `{ deviceId }` и подписаться на
   `partner_found` и `partner_cancelled`.
3. `POST /role` — сохранить выбранный пол.
4. `POST /queue/join` — встать в очередь.
5. Ждать событие `partner_found`. Если `POST /queue/join` сразу вернул `PARTNER_FOUND`,
   можно считать мэтч полученным.
6. При перезагрузке/переподключении снова вызвать `POST /queue/join` —
   сервер вернет `PARTNER_FOUND`, если пара уже создана.
7. (UI) При отмене поиска клиент вызывает `POST /queue/cancel`, очищает локально
   сохраненную роль и возвращается к выбору роли.
8. (UI) Если отмена происходит после `partner_found` (до старта сессии),
   сервер шлет второму участнику событие `partner_cancelled`.

## HTTP

### POST /role

**Body:** `RoleSelectRequest`

```ts
{
  deviceId: string;
  role: 'MALE' | 'FEMALE';
}
```

**Response:**

```ts
{ status: 'OK' }
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.

**Notes:**

- Idempotent: повторный вызов перезапишет роль.
- Не ставит в очередь — только сохраняет роль.

### POST /queue/join

**Body:** `QueueJoinRequest`

```ts
{
  deviceId: string;
}
```

**Response:** `QueueJoinResponse`

```ts
{
  status: 'QUEUED' | 'PARTNER_FOUND';
  sessionId?: string;
}
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.
- `409 ROLE_REQUIRED` — роль не выбрана.

**Notes:**

- Idempotent: повторный вызов не дублирует пользователя в очереди.
- Если пара уже есть, ответ будет `PARTNER_FOUND` с текущим `sessionId`.
- Можно использовать как polling fallback (повторять запрос раз в N секунд).

### POST /queue/cancel

**Body:** `QueueCancelRequest`

```ts
{
  deviceId: string;
}
```

**Response:**

```ts
{ status: 'OK' }
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.

**Notes:**

- Idempotent: повторный вызов безопасен.
- Удаляет пользователя из очереди.
- Если есть активная пара в состоянии `PARTNER_FOUND`, очищает сессию и
  отправляет второму пользователю событие `partner_cancelled`.

## WebSocket (Socket.io)

### Connection Auth

```ts
{
  deviceId: string;
}
```

**Notes:**

- При невалидном auth сервер шлет `error: "INVALID_AUTH"` и разрывает соединение.

### Event: partner_found

**Payload:** `PartnerFoundEvent`

```ts
{
  sessionId: string;
}
```

**Notes:**

- Событие отправляется обоим пользователям пары.
- Отправка возможна только при активном Socket.io соединении.

### Event: partner_cancelled

**Payload:** `PartnerCancelledEvent`

```ts
{
  sessionId: string;
}
```

**Notes:**

- Событие отправляется второму пользователю, если партнер отменил поиск
  после `partner_found` и до старта сессии.
