Приложение состоит из клиентской серверной части:

- ./apps/client
- ./apps/server

Основа любых изменений - документация ./docs/

## CONTRACTS

Always check and follow "packages/shared/contracts-core-flow.md".

Update the contracts file when contracts change.

## DEFINITION OF DONE

0. Весь код покрыт юнит-тестами.
1. Код написан на TypeScript без `any`.
2. Входные данные валидируются через Zod.
3. Событие залогировано (JSON формат для аналитики).
4. В каждом модуле есть актуальный README.md с функциональными требованиями и
   обоснованием и он обновлен в сответствии с изменениями в коде
5. Исправлены все предупреждения линтера.
6. Все тесты проходят.
