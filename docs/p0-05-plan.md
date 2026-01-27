# P0-05 — План реализации (шаг диалога: видео + бабл + кнопки)

## Цель

Реализовать показ одного шага диалога после `session_started`: видео партнёра,
текстовый бабл и кнопки выбора ответа. Сервер — источник правды, клиент
только рендерит.

## Входные данные (источник контента)

- Файл: `assets/s1/s1.json`
- Используемые поля:
  - `actor` (объект) → говорящий (`name: 'He' | 'She'`)
  - `text` → bubble text
  - `choices` → варианты ответа
  - `videoByRole` → optional видео для `male`/`female`
- Всё остальное игнорируется (но допускается в JSON).

## Контракты (обязательное)

- Обновить `packages/shared/contracts-core-flow.md` (добавлен `session_step`).
- Новый WS event: `session_step`.
- Payload:
  - `sessionId`, `stepId`, `actor`, `bubbleText`, `choices[]`, `videoUrl`,
    `turnDeviceId`.
- `stepId` — это `current_step.id` из сценария.
- `videoUrl` правило: `<videoId>.mp4` (файл хранится в `assets/s1`, сервер отдает по `/videos/`).
- `videoId` берётся из `videoByRole` текущего шага для роли пользователя.
  Если для роли значение отсутствует — сервер повторно отправляет прошлый
  `videoUrl` (клиент не содержит логики "не менять").

## Guardrails (чтобы джуны не сломали)

1. **Fail-fast валидация:** сценарий валидируется Zod‑схемой на старте сервера.
2. **Единый источник типов:** все схемы в `@romance/shared`.
3. **Единый формат названий:** в контрактах только `camelCase`
   (`turnDeviceId`, `stepId`).
4. **Никакой логики выбора шага на клиенте:** клиент отображает только то,
   что пришло в `session_step`.
5. **Жёсткая конвенция видео:** `<videoId>.mp4`; отсутствие файла = ошибка
   старта (сервер не поднимается).
6. **Строгие состояния сессии:** только сервер выставляет `currentStepId` и
   `turnDeviceId`.

## План работ (по слоям)

### 1) Shared (типизация + контракты)

- Добавить Zod‑схемы:
  - `ScenarioNodeSchema` (минимальный срез из `s1.json`, `.passthrough()`).
  - `SessionStepEventSchema`.
- Добавить типы: `ScenarioNode`, `SessionStepEvent`, `ScenarioActorName`,
  `StepId`.
- Обновить аналитические события (если нужен `step_shown`).
- Тесты схем (валидный/невалидный узел, валидный event).

### 2) Server (контент + событие шага)

- Новый модуль `dialog`:
  - загрузка `assets/s1/s1.json`,
  - Zod‑валидация,
  - индекс шагов `byId`,
  - вычисление `rootStepId` (`prev.length === 0`).
- Расширить `Session`:
- `currentStepId`,
  - `turnDeviceId` (вычисляется из `actor.name`).
- `lastVideoByRole` (сервер хранит последнее видео для каждой роли).
- При `POST /session/start`:
  - установить первый шаг,
  - сформировать `session_step` payload,
  - отправить событие обоим участникам.
- Логирование (JSON): `session_step` или `step_shown`.
- Unit‑тесты:
  - loader валидирует сценарий,
  - старт сессии публикует `session_step`.

### 3) Client (UI шага)

- Расширить `AppState`:
  - `currentStep`, `choices`, `turnDeviceId`.
- Новые UI‑состояния:
  - `ACTIVE_MY_TURN`, `ACTIVE_WAIT`.
- WS обработчик `session_step`:
  - Zod‑валидация,
  - обновление состояния.
- Экран шага:
  - `<video src={videoUrl} loop muted playsInline />`
  - bubble text = `bubbleText`.
  - кнопки — только когда `turnDeviceId === deviceId`.
- Unit‑тесты reducer на переход `SESSION_STEP_RECEIVED`.

### 4) Документация

- Обновить `packages/shared/contracts-core-flow.md` (сделано).
- README модуля `dialog` + README `apps/client/src/features/session/`:
  функциональные требования и обоснование.

## Definition of Done (для P0-05)

- Первый шаг показывается после `session_started` через `session_step`.
- Видео грузится по правилу `<videoId>.mp4`, луп и без звука.
- Если `videoByRole` отсутствует для роли, видео не меняется.
- Бабл содержит `text` из `s1.json`.
- Активный игрок видит кнопки выбора, пассивный — статус ожидания.
- Все входные данные валидируются Zod‑схемами.
- События логируются в JSON формате.
- Все тесты зелёные, линтер без предупреждений.

## Открытые вопросы

- Нужен ли отдельный аналитический event `step_shown`?
- Разрешаем ли `choices` пустыми (end‑step) или требуем минимум 1?
