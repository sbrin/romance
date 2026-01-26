# @romance/shared

Единое ядро типов, Zod-схем и констант для клиента и сервера.

## Что здесь хранится

- Контракты HTTP/WS (схемы и типы).
- Единые имена состояний/статусов/событий.
- Zod-схемы для валидации входных и сетевых данных.

## Правила использования

- Не хардкодить строки состояний/событий — брать из констант.
- Любые входящие данные валидировать через `*.Schema.safeParse`.
- Клиент парсит ответы серверных API через схемы отсюда.

## Примеры

```ts
import {
  QUEUE_JOIN_STATUS,
  QueueJoinResponseSchema,
  SESSION_STATE,
  SOCKET_EVENT,
} from '@romance/shared';

if (response.status === QUEUE_JOIN_STATUS.PARTNER_FOUND) {
  // ...
}

const parsed = QueueJoinResponseSchema.safeParse(payload);
if (!parsed.success) throw new Error('INVALID_BODY');

socket.on(SOCKET_EVENT.PARTNER_FOUND, (payload) => {
  // ...
});
```
