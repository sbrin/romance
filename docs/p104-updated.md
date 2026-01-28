### P1-04 (UPDATED)

**Title:** ускорить переходы между шагами

**Story:** "Как пользователь, я хочу, чтобы переходы между шагами были быстрыми, чтобы не терять ощущение диалога".

**Acceptance Criteria (AC):**

- [ ] Предзагрузка видео следующего шага выполняется в фоне.
- [ ] Переход шага занимает ≤ 2 сек на тестовом наборе для waiter (пользователя, ожидающего выбор партнера).
- [ ] Если предзагрузка не удалась, показывается безопасный фолбэк (лоадер, затем обычная загрузка).
- [ ] Сервер сообщает клиенту, какие видео нужно предзагрузить (через новое поле в `session_step`).

**Notes:**

- Тестовый набор видео фиксируется заранее в сценарии.
- Клиент НЕ получает весь сценарий — только список видео для предзагрузки от сервера.

---

## Архитектурный контекст

### Как работает видео в приложении (КРИТИЧНО для понимания)

**Основное правило:**
- Пользователь видит видео **ПАРТНЕРА** (не своё)
- `videoByRole.male` — это видео, которое видит МУЖЧИНА (т.е. видео женщины)
- `videoByRole.female` — это видео, которое видит ЖЕНЩИНА (т.е. видео мужчины)

**Пример:**

```json
// Шаг 1: actor="He" (мужчина говорит, женщина делает выбор)
{
  "id": "step-1",
  "actor": { "name": "He" },
  "text": "Привет!",
  "choices": {
    "step-2a": "Привет!",
    "step-2b": "Пока"
  },
  "videoByRole": {
    "male": "f1",     // видео женщины (видит мужчина)
    "female": "m1"    // видео мужчины (видит женщина)
  }
}
```

**Что происходит:**
- MALE (waiter): видит `f1.mp4` (видео женщины), ждет выбор FEMALE
- FEMALE (chooser): видит `m1.mp4` (видео мужчины), делает выбор

**Когда FEMALE выбирает "Привет!" (переход на step-2a):**
```json
{
  "id": "step-2a",
  "actor": { "name": "She" },
  "videoByRole": {
    "male": "f2",     // НОВОЕ видео для мужчины
    "female": "m2"    // НОВОЕ видео для женщины
  }
}
```

**Изменение видео при переходе:**
- ✅ MALE (был waiter): видео МЕНЯЕТСЯ `f1 → f2` — **КРИТИЧНО: должно быть предзагружено!**
- ❌ FEMALE (был chooser): видео меняется `m1 → m2` — некритично, она только что выбрала

### Ключевое наблюдение

**Waiter (ждет выбор партнера):**
- Видит ДИНАМИЧЕСКОЕ видео — меняется после выбора партнера
- Должно быть предзагружено для плавного перехода ≤ 2 сек

**Chooser (делает выбор):**
- Видит СТАТИЧЕСКОЕ видео — не меняется при своем выборе
- Видео обновится только на следующем шаге (когда он станет waiter)
- Предзагрузка некритична — пользователь только что выбрал, есть время

---

## Стратегия предзагрузки (ПРАВИЛЬНАЯ)

### Waiter (ждет выбор партнера)

**Цель:** Обеспечить ≤ 2 сек переход при выборе партнера.

**Логика:**
1. Получает `session_step` с текущим шагом
2. Сервер вычисляет все следующие шаги по `choices`
3. Сервер добавляет в `session_step.preloadVideoUrls` — список видео для предзагрузки
4. Клиент **СРАЗУ** запускает предзагрузку всех видео из списка
5. Когда партнер делает выбор → видео уже в кэше → мгновенный переход

**Пример:**
```typescript
// Сервер отправляет waiter:
{
  ...session_step,
  choices: [
    { id: "step-2a", text: "Привет!" },
    { id: "step-2b", text: "Пока" }
  ],
  preloadVideoUrls: ["f2.mp4", "f3.mp4"]  // видео для waiter во всех следующих шагах
}
```

### Chooser (делает выбор)

**Цель:** Не блокировать UI, предзагрузка опциональна.

**Логика:**
1. Получает `session_step` с кнопками выбора
2. Сервер НЕ добавляет `preloadVideoUrls` (или добавляет пустой массив)
3. Пользователь думает и выбирает вариант
4. Отправляет `POST /session/step/answer`
5. **ПОСЛЕ** отправки — можно запустить предзагрузку следующего видео (опционально)
6. Сервер присылает `session_step` со следующим шагом
7. Если видео не готово — показать лоадер, загрузить обычным способом

**Почему некритично:**
Chooser только что сделал выбор и **видит то же видео партнера** (не меняется). Новое видео понадобится только на следующем шаге (когда роли поменяются).

---

## Изменения в архитектуре

### 1. Контракты: Расширить SessionStepEvent

**Файл:** `packages/shared/src/index.ts`

**Изменение:**
```typescript
export const SessionStepEventSchema = z.object({
  sessionId: SessionIdSchema,
  stepId: StepIdSchema,
  actor: SessionActorSchema,
  bubbleText: z.string(),
  choices: z.array(SessionStepChoiceSchema),
  videoUrl: z.string().min(1),
  turnDeviceId: DeviceIdSchema,

  // НОВОЕ ПОЛЕ
  preloadVideoUrls: z.array(z.string()).optional(),
});
```

**Логика:**
- Если пользователь НЕ на ходу (waiter) → сервер заполняет `preloadVideoUrls`
- Если пользователь на ходу (chooser) → поле пустое или отсутствует

### 2. Контракты: Обновить contracts-core-flow.md

**Файл:** `packages/shared/contracts-core-flow.md`

**Добавить в секцию `Event: session_step`:**

```markdown
### Event: session_step

**Payload:** `SessionStepEvent`

```ts
{
  sessionId: string;
  stepId: string;
  actor: {
    name: 'He' | 'She';
    avatarPath?: string;
  };
  bubbleText: string;
  choices: Array<{
    id: string;
    text: string;
  }>;
  videoUrl: string;
  turnDeviceId: string;

  // Опциональный список видео для предзагрузки
  preloadVideoUrls?: string[];
}
```

**Notes:**

- ...существующие notes...
- **preloadVideoUrls** — список видео для фоновой предзагрузки.
  - Заполняется только для пользователя, который **НЕ** на ходу (waiter).
  - Содержит `videoUrl` для роли пользователя во всех следующих шагах (по всем `choices`).
  - Клиент должен запустить предзагрузку сразу после получения события.
  - Если поле отсутствует или пустое — предзагрузка не требуется.
```

### 3. Server: Обновить dialog service

**Файл:** `apps/server/src/modules/dialog/service.ts`

**Добавить метод для вычисления preload видео:**

```typescript
export type DialogService = {
  // ...существующие методы

  // НОВЫЙ МЕТОД
  computePreloadVideoUrls: (params: {
    stepId: StepId;
    role: UserRole;
  }) => string[];
};

// Реализация
const computePreloadVideoUrls = (params: { stepId: StepId; role: UserRole }): string[] => {
  const step = scenario.byId.get(params.stepId);
  if (!step || !step.choices) {
    return [];
  }

  const roleKey = mapRoleToVideoKey(params.role);
  const videoUrls: string[] = [];

  for (const nextStepId of Object.keys(step.choices)) {
    const nextStep = scenario.byId.get(nextStepId);
    if (!nextStep) continue;

    const videoId = nextStep.videoByRole?.[roleKey];
    if (videoId) {
      videoUrls.push(`${videoId}.mp4`);
    }
  }

  return videoUrls;
};
```

**Обновить createSessionStepEvent:**

```typescript
createSessionStepEvent: ({
  sessionId,
  stepId,
  role,
  turnDeviceId,
  previousVideoUrl,
}) => {
  const step = scenario.byId.get(stepId);
  if (!step) {
    throw new Error('STEP_NOT_FOUND');
  }

  const videoUrl = resolveVideoUrl(step, role, previousVideoUrl);

  // Вычислить preload только для waiter (deviceId !== turnDeviceId)
  // Этот параметр будет передан снаружи
  const payload = SessionStepEventSchema.parse({
    sessionId,
    stepId: step.id,
    actor: {
      name: step.actor.name,
      avatarPath: step.actor.avatarPath,
    },
    bubbleText: step.text,
    choices: mapChoices(step.choices),
    videoUrl,
    turnDeviceId,
    // preloadVideoUrls будет добавлен в routes
  });

  return { payload, videoUrl };
},
```

**Альтернатива (проще):** Добавить параметр `shouldPreload`:

```typescript
createSessionStepEvent: ({
  sessionId,
  stepId,
  role,
  turnDeviceId,
  previousVideoUrl,
  shouldPreload = false,  // НОВЫЙ ПАРАМЕТР
}) => {
  // ...existing code

  const preloadVideoUrls = shouldPreload
    ? computePreloadVideoUrls({ stepId, role })
    : undefined;

  const payload = SessionStepEventSchema.parse({
    // ...existing fields
    preloadVideoUrls,
  });

  return { payload, videoUrl };
},
```

### 4. Server: Обновить session routes

**Файл:** `apps/server/src/modules/session/routes.ts`

**В функции отправки session_step добавить логику:**

```typescript
// Пример: в /session/start когда отправляем первый шаг
for (const user of result.users) {
  if (!user.role) {
    throw new Error('ROLE_REQUIRED');
  }

  const previousVideoUrl = result.session.lastVideoByRole[user.role] ?? null;
  const shouldPreload = user.deviceId !== result.session.turnDeviceId;

  const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
    sessionId: result.session.id,
    stepId,
    role: user.role,
    turnDeviceId: result.session.turnDeviceId,
    previousVideoUrl,
    shouldPreload,  // ПЕРЕДАЕМ ФЛАГ
  });

  result.session.lastVideoByRole[user.role] = videoUrl;
  deps.socketHub.emitSessionStep(user.deviceId, payload);
}
```

**То же самое в /session/step/answer:**

```typescript
for (const user of [userA, userB]) {
  // ...
  const shouldPreload = user.deviceId !== session.turnDeviceId;

  const { payload, videoUrl } = deps.dialogService.createSessionStepEvent({
    // ...
    shouldPreload,
  });
  // ...
}
```

### 5. Client: Утилита для предзагрузки видео

**Новый файл:** `apps/client/src/features/session/videoPreloader.ts`

```typescript
type VideoStatus = 'idle' | 'loading' | 'ready' | 'failed';

class VideoPreloader {
  private cache: Map<string, VideoStatus> = new Map();
  private videos: Map<string, HTMLVideoElement> = new Map();

  /**
   * Предзагружает видео в фоне
   */
  preload(videoUrls: string[]): void {
    for (const url of videoUrls) {
      if (this.cache.get(url) !== 'idle' && this.cache.has(url)) {
        continue; // уже загружается или готово
      }

      this.cache.set(url, 'loading');
      const video = document.createElement('video');
      video.preload = 'auto';
      video.src = `/videos/${url}`;

      video.addEventListener('canplaythrough', () => {
        this.cache.set(url, 'ready');
        this.videos.set(url, video);
      });

      video.addEventListener('error', () => {
        this.cache.set(url, 'failed');
      });

      video.load();
    }
  }

  /**
   * Проверяет, готово ли видео
   */
  isReady(videoUrl: string): boolean {
    return this.cache.get(videoUrl) === 'ready';
  }

  /**
   * Получает предзагруженное видео (если готово)
   */
  getVideo(videoUrl: string): HTMLVideoElement | null {
    return this.videos.get(videoUrl) ?? null;
  }

  /**
   * Очищает кэш (при завершении сессии)
   */
  clear(): void {
    for (const video of this.videos.values()) {
      video.src = '';
    }
    this.cache.clear();
    this.videos.clear();
  }
}

export const videoPreloader = new VideoPreloader();
```

### 6. Client: Использование в App.tsx

**Файл:** `apps/client/src/App.tsx`

```typescript
import { videoPreloader } from './features/session/videoPreloader';

// В обработчике session_step
socket.on(SOCKET_EVENT.SESSION_STEP, (payload: unknown) => {
  const parsed = SessionStepEventSchema.safeParse(payload);
  if (!parsed.success) {
    return;
  }

  // Запустить предзагрузку если есть список
  if (parsed.data.preloadVideoUrls && parsed.data.preloadVideoUrls.length > 0) {
    videoPreloader.preload(parsed.data.preloadVideoUrls);
  }

  dispatch({ type: 'SESSION_STEP_RECEIVED', payload: parsed.data });
});

// При завершении сессии
socket.on(SOCKET_EVENT.SESSION_ENDED, (payload: unknown) => {
  // ...
  videoPreloader.clear();
  // ...
});
```

### 7. Client: Компонент видео с fallback

**Обновить:** `apps/client/src/features/session/VideoPlayer.tsx` (или где используется видео)

```typescript
const VideoPlayer = ({ videoUrl }: { videoUrl: string }) => {
  const [loading, setLoading] = useState(!videoPreloader.isReady(videoUrl));

  useEffect(() => {
    if (videoPreloader.isReady(videoUrl)) {
      setLoading(false);
    } else {
      // Если не готово, показать лоадер и загрузить
      setLoading(true);
    }
  }, [videoUrl]);

  if (loading) {
    return <div className="video-loader">Загрузка...</div>;
  }

  return (
    <video
      src={`/videos/${videoUrl}`}
      autoPlay
      loop
      muted
      onCanPlay={() => setLoading(false)}
    />
  );
};
```

### 8. Client: Опциональная предзагрузка для chooser после выбора

**Файл:** `apps/client/src/api/http.ts` (или в обработчике выбора)

```typescript
// После отправки POST /session/step/answer
const response = await postJson('/session/step/answer', {
  deviceId,
  sessionId,
  choiceId,
});

// Опционально: предзагрузить видео следующего шага
// Требует, чтобы клиент знал videoUrl следующего шага
// Это сложнее, поэтому можно пропустить для MVP
```

---

## Тестирование

### Юнит-тесты

**Файл:** `packages/shared/src/index.test.ts`

```typescript
test('SessionStepEventSchema accepts preloadVideoUrls', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'She', avatarPath: 'avatars/she.png' },
    bubbleText: 'Привет',
    choices: [{ id: 'step-abcdef12', text: 'Да' }],
    videoUrl: 'f1.mp4',
    turnDeviceId: 'device-12345678',
    preloadVideoUrls: ['f2.mp4', 'f3.mp4'],
  };

  const parsed = SessionStepEventSchema.safeParse(payload);
  assert.equal(parsed.success, true);
});
```

**Файл:** `apps/server/src/modules/dialog/service.test.ts`

```typescript
test('computePreloadVideoUrls returns video URLs for next steps', () => {
  const scenario = {
    nodes: [
      {
        id: 'step-1',
        actor: { name: 'He' },
        text: 'Привет',
        prev: [],
        choices: { 'step-2a': 'Да', 'step-2b': 'Нет' },
        videoByRole: { male: 'f1', female: 'm1' },
      },
      {
        id: 'step-2a',
        actor: { name: 'She' },
        text: 'Круто',
        prev: ['step-1'],
        videoByRole: { male: 'f2', female: 'm2' },
      },
      {
        id: 'step-2b',
        actor: { name: 'She' },
        text: 'Окей',
        prev: ['step-1'],
        videoByRole: { male: 'f3', female: 'm3' },
      },
    ],
  };

  const service = createDialogService({ scenarioData: scenario });
  const urls = service.computePreloadVideoUrls({
    stepId: 'step-1',
    role: USER_ROLE.MALE,
  });

  assert.deepEqual(urls, ['f2.mp4', 'f3.mp4']);
});
```

**Файл:** `apps/client/src/features/session/videoPreloader.test.ts`

```typescript
test('VideoPreloader tracks loading status', () => {
  const preloader = new VideoPreloader();

  preloader.preload(['test1.mp4', 'test2.mp4']);

  // Изначально loading
  assert.equal(preloader.isReady('test1.mp4'), false);

  // После canplaythrough → ready
  // (требует mock HTMLVideoElement)
});
```

### Интеграционные тесты

**Сценарий 1: Waiter получает preloadVideoUrls**

1. Создать сессию с двумя пользователями
2. Подтвердить старт
3. Проверить, что waiter получил `session_step` с `preloadVideoUrls`
4. Проверить, что chooser получил `session_step` БЕЗ `preloadVideoUrls`

**Сценарий 2: Предзагрузка работает на клиенте**

1. Загрузить приложение
2. Создать сессию
3. На шаге как waiter — проверить, что началась предзагрузка видео
4. Сделать выбор → проверить, что видео показалось без задержки

### Метрики

**Событие:** `video_play_latency`

```json
{
  "event": "video_play_latency",
  "deviceId": "device-...",
  "sessionId": "session-...",
  "stepId": "step-...",
  "role": "MALE",
  "wasPreloaded": true,
  "latencyMs": 450,
  "ts": "2026-01-28T12:34:56.789Z"
}
```

**Цель:** 90-й перцентиль `latencyMs` ≤ 2000 для waiter с `wasPreloaded=true`.

---

## Документация

### Обновить README модуля

**Файл:** `apps/client/src/features/session/README.md`

Добавить секцию:

```markdown
## Video Preloading

Для обеспечения плавных переходов (≤ 2 сек) используется предзагрузка видео:

- Сервер вычисляет, какие видео понадобятся пользователю в следующих шагах
- Добавляет список в `session_step.preloadVideoUrls`
- Клиент запускает фоновую загрузку сразу после получения события
- При переходе на следующий шаг видео уже в кэше

**Когда предзагружается:**
- Для waiter (ждет выбор партнера): ВСЕ возможные видео следующих шагов
- Для chooser (делает выбор): предзагрузка не критична, может быть пропущена

**Fallback:** Если видео не готово, показывается лоадер и обычная загрузка.
```

---

## Итоговый чеклист имплементации

### Shared (packages/shared)

- [ ] Добавить `preloadVideoUrls?: z.array(z.string())` в `SessionStepEventSchema`
- [ ] Обновить `contracts-core-flow.md` с описанием нового поля
- [ ] Добавить тесты для нового поля в `index.test.ts`
- [ ] Rebuild: `pnpm build`

### Server (apps/server)

- [ ] Добавить метод `computePreloadVideoUrls` в `dialog/service.ts`
- [ ] Обновить `createSessionStepEvent` для поддержки `shouldPreload`
- [ ] Обновить `/session/start` для передачи `shouldPreload`
- [ ] Обновить `/session/step/answer` для передачи `shouldPreload`
- [ ] Обновить `/session/resume` для передачи `shouldPreload`
- [ ] Добавить тесты для `computePreloadVideoUrls`
- [ ] Проверить, что тесты проходят: `pnpm test`

### Client (apps/client)

- [ ] Создать `features/session/videoPreloader.ts`
- [ ] Интегрировать в `App.tsx` (обработчик `SESSION_STEP`)
- [ ] Обновить компонент видео для поддержки fallback
- [ ] Добавить очистку кэша при `SESSION_ENDED`
- [ ] Добавить тесты для `videoPreloader`
- [ ] Добавить логирование события `video_play_latency`
- [ ] Проверить, что тесты проходят: `pnpm test`

### Документация

- [ ] Обновить README модуля session с секцией о предзагрузке
- [ ] Обновить CLAUDE.md с информацией о предзагрузке (опционально)

### Тестирование

- [ ] Интеграционный тест: waiter получает preloadVideoUrls
- [ ] Интеграционный тест: chooser НЕ получает preloadVideoUrls
- [ ] E2E тест: измерить latency перехода на тестовом наборе
- [ ] Проверить fallback при ошибке загрузки

---

## Возможные улучшения (вне скоупа P1-04)

- Приоритизация предзагрузки (сначала наиболее вероятные варианты)
- Ограничение одновременных загрузок (max 3 параллельных)
- Кэширование через Service Worker для повторных сессий
- Предзагрузка на N шагов вперед (сейчас только следующий шаг)
