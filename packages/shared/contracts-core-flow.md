# Core Flow Contracts (P0-01..P0-07)

Эта спецификация описывает минимальные HTTP/WS контракты для Core Flow.

## Shared Types

### Naming convention (global rule)

- **Все имена полей в HTTP/WS payload — только `camelCase`.**
- Snake_case запрещён в контрактах, чтобы не было расхождений между TS и JSON.
- Если в старых текстах встречается snake_case, см. маппинг ниже.

### deviceId

- string, min length 8 (рекомендуем UUID).
- Должен быть стабильным между перезагрузками (хранить в localStorage).
- Используется и в HTTP, и в Socket.io auth.

### role

- `'MALE' | 'FEMALE'`
- Маппинг UI:
  - "Мужчина" → `MALE`
  - "Женщина" → `FEMALE`

### scenario_actor_name

- `'He' | 'She' | 'waiter'`
- Источник: файл сценария (напр. `assets/s2/s2.json`) → поле `actor.name`.
- Маппинг на роль для определения хода:
  - `He` → `MALE` (говорящий)
  - `She` → `FEMALE` (говорящий)
  - `waiter` → служебный actor без отдельной turn-логики на этом этапе.

### step_id

- string, min length 8.
- Источник: файл сценария (напр. `assets/s2/s2.json`) → поле `id`.

### choiceId

- string, числовой индекс (`"0"`, `"1"`, `"2"`, ...).
- Соответствует индексу в массиве `choices` текущего шага.
- Маппится на массив `next` в сценарии по тому же индексу.

### videoId

- string.
- Идентификатор видео для роли в конкретном шаге.

### video_url

- string.
- Правило: `<videoId>.mp4` (файл хранится в папке сценария, напр. `assets/s2`, сервер отдает по `/videos/`).

### videoByRole (internal)

- Внутренний серверный тип, не присутствует в JSON сценария напрямую.
- object с ключами `male` и/или `female`.
- Значение: `videoId` (например, `"s1m1"`).
- **Вычисляется при загрузке** из поля `data.fields [{fieldName:"video", fieldValue:"<id>.mp4"}]`:
  - Actor `She` → видео показывается FEMALE (`videoByRole.female = id`).
  - Actor `He` → видео показывается MALE (`videoByRole.male = id`).
  - Actor `waiter` → видео показывается обоим (`videoByRole.male = id`, `videoByRole.female = id`).
- Root-нода: видео генерируется из имени сценария (`<name>m0`, `<name>f0`).
- Если для роли значение отсутствует — **видео для этой роли не обновляется**.

> Внутреннее состояние клиента может хранить `currentStepId`, но в событии
> `session_step` используется `stepId`.

## Recommended Client Flow (P0-01..P0-04)

1. Сгенерировать `deviceId` один раз и сохранить локально.
2. Подключиться к Socket.io с auth `{ deviceId }` и подписаться на
   `partner_found` и `partner_cancelled`.
3. После подключения проверить активную сессию через `POST /session/resume`.
   Если ответ `ACTIVE`, восстановить шаг диалога из `step` и продолжить.
   Если ответ `FOUND`, `WAITING` или `QUEUED`, восстановить соответствующий
   экран поиска/мэтча.
4. `POST /role` — сохранить выбранный пол.
5. (UI) Сохранить роль локально и использовать ее для повторных запусков поиска
   без повторного выбора.
6. (UI) Показать экран «начать поиск»; по нажатию вызвать `POST /queue/join`.
7. Ждать событие `partner_found`. Если `POST /queue/join` сразу вернул `PARTNER_FOUND`,
   можно считать мэтч полученным.
8. Показать кнопку «Начать» на экране мэтча и отправить `POST /session/start` после
   подтверждения пользователя.
9. Если второй пользователь ещё не подтвердил старт — показать статус «Жду партнера».
10. Когда оба подтвердили старт, сервер отправляет событие `session_started`.
11. При перезагрузке/переподключении по нажатию «начать поиск» снова вызвать
   `POST /queue/join` — сервер вернет `PARTNER_FOUND`, если пара уже создана.
12. (UI) При отмене поиска клиент вызывает `POST /queue/cancel` и возвращается
   к экрану «начать поиск» без повторного выбора роли.
13. (UI) Если отмена происходит после `partner_found` (до старта сессии),
   сервер шлет второму участнику событие `partner_cancelled`.
14. После `session_started` сервер отправляет событие `session_step` с первым
   шагом.
15. Клиент отображает видео, бабл и кнопки выбора ответа на основе `session_step`.

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
- Клиент сохраняет роль локально и не обязан очищать ее при отмене.
- Если есть активная пара в состоянии `PARTNER_FOUND`, `WAITING_FOR_START` или
  `ACTIVE`, очищает сессию и отправляет второму пользователю событие
  `partner_cancelled`.

### POST /session/start

**Body:** `SessionStartRequest`

```ts
{
  deviceId: string;
  sessionId: string;
}
```

**Response:** `SessionStartResponse`

```ts
{
  status: 'WAITING' | 'STARTED';
}
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.
- `404 SESSION_NOT_FOUND` — сессия не найдена или пользователь не участник.
- `409 SESSION_NOT_READY` — сессия не в состоянии старта.

**Notes:**

- Idempotent: повторный вызов не ломает протокол.
- Если второй участник уже подтвердил, статус будет `STARTED` и сервер
  отправит `session_started` обоим.

### POST /session/step/answer

**Body:** `SessionAnswerRequest`

```ts
{
  deviceId: string;
  sessionId: string;
  choiceId: string;
}
```

**Response:** `SessionAnswerResponse`

```ts
{
  status: 'OK' | 'NOOP';
}
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.
- `404 SESSION_NOT_FOUND` — сессия не найдена или пользователь не участник.
- `409 SESSION_NOT_ACTIVE` — сессия не в состоянии `ACTIVE`.
- `409 INVALID_CHOICE` — `choiceId` не соответствует `currentStep.choices`.

**Notes:**

- Ответ разрешен только `turnDeviceId`. Иначе `NOOP` без ошибок/событий.
- `choiceId` — числовой индекс выбранного варианта (`"0"`, `"1"`, `"2"`, ...).
- Текст выбранного варианта сохраняется и передаётся партнёру как `bubbleText` следующего шага.
- Сервер отправляет `session_step` обоим клиентам для следующего шага.

### POST /session/end

**Body:** `SessionEndRequest`

```ts
{
  deviceId: string;
  sessionId: string;
}
```

**Response:** `SessionEndResponse`

```ts
{
  status: 'OK' | 'NOOP';
}
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.
- `404 SESSION_NOT_FOUND` — сессия не найдена или пользователь не участник.

**Notes:**

- Idempotent: повторный вызов безопасен.
- Очищает `sessionId`/шаги у обоих участников.
- Если сессия активна — сервер шлет `session_ended`.

### POST /session/resume

**Body:** `SessionResumeRequest`

```ts
{
  deviceId: string;
}
```

**Response:** `SessionResumeResponse`

```ts
{
  status: 'ACTIVE' | 'FOUND' | 'WAITING' | 'QUEUED' | 'NONE';
  sessionId?: string;
  step?: SessionStepEvent;
}
```

**Errors:**

- `400 INVALID_BODY` — невалидный JSON.
- `409 ROLE_REQUIRED` — роль не выбрана для активной сессии.

**Notes:**

- Используется при загрузке приложения для восстановления активной/ожидающей
  сессии.
- `step` совпадает по форме с WS событием `session_step`.
- `FOUND` — партнёр найден, пользователь ещё не подтвердил старт.
- `WAITING` — пользователь подтвердил старт и ждёт партнёра.
- `QUEUED` — пользователь находится в очереди и ждёт партнёра.
- Если активной сессии нет, возвращает `{ status: 'NONE' }`.

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

### Event: session_started

**Payload:** `SessionStartedEvent`

```ts
{
  sessionId: string;
}
```

**Notes:**

- Событие отправляется обоим пользователям после подтверждения старта.
- Детали первого шага передаются отдельным событием `session_step`.

### Event: session_step

**Payload:** `SessionStepEvent`

```ts
{
  sessionId: string;
  stepId: string;
  actor: {
    name: 'He' | 'She' | 'waiter';
    avatarPath?: string;
  };
  bubbleText: string;
  choices: Array<{
    id: string;
    text: string;
  }>;
  videoUrl: string;
  turnDeviceId: string;
  preloadVideoUrls?: string[];
}
```

**Notes:**

- Событие отправляется обоим пользователям после `session_started` и при каждом
  обновлении шага.
- `bubbleText` — текст выбора, сделанного партнёром на предыдущем шаге.
  Первый шаг имеет пустой `bubbleText`. При resume используется сохранённый `lastBubbleText`.
- `choices` строится из `data.choices` (индекс → `id`, элемент → `text`).
- `stepId` — это `current_step.id` из сценария.
- `videoUrl` формируется из `videoId` по правилу `<videoId>.mp4`.
- `videoUrl` вычисляется **персонально для каждого клиента**:
  если для роли есть `videoByRole` в шаге — обновить, иначе оставить предыдущее
  видео (сервер повторно отправляет последний `videoUrl`).
- Если `choices` пустые — это терминальный шаг, после него сервер шлет
  `session_ended`.
- **preloadVideoUrls** — опциональный список видео для фоновой предзагрузки.
  - Заполняется только для пользователя, который **НЕ** на ходу (waiter, `deviceId !== turnDeviceId`).
  - Содержит `videoUrl` для роли пользователя во всех следующих шагах (по всем `choices`).
  - Клиент должен запустить предзагрузку сразу после получения события.
  - Если поле отсутствует или пустое — предзагрузка не требуется.

### Event: session_ended

**Payload:** `SessionEndedEvent`

```ts
{
  sessionId: string;
  reason: 'completed' | 'timeout' | 'cancelled';
}
```

**Notes:**

- Событие отправляется обоим пользователям при завершении сессии.
