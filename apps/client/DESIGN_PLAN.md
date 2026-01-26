# Client Design + Implementation Plan (V1)

## Design Direction

- Tone: cinematic, intimate, “late‑night film still” — warm highlights over deep
  navy/charcoal.
- Typography: high‑contrast serif for romance cues + restrained grotesk for UI.
  - Display: Poiret One
  - UI: Hanken Grotesk (or similar humanist grotesk)
- Palette (CSS vars):
  - `--ink`: deep navy background
  - `--ember`: warm amber accent
  - `--rose`: muted blush
  - `--fog`: translucent off‑white for text
- Layout: portrait, full‑bleed video, gradient scrim, floating dialogue bubble,
  anchored choice buttons.
- Motion: one orchestrated page‑load reveal; Start halo pulse; bubble “bloom”;
  queue heartbeat.

## UI Map (Pitch → Screens)

- Role Select → two large buttons centered; short copy.
- Queue → ambient animation + “Ищем партнёра…”.
- Partner Found → hero message + Start button.
- Waiting for Start → status copy + spinner.
- Active (my turn) → video + bubble + response buttons.
- Active (waiting) → video + bubble + “Ждём ответ…”.
- Timeout Warn → overlay banner.
- Session End → “Сессия завершена” + “В очередь”.

## Component Inventory

- `VideoStage` (full‑bleed video + gradient scrim)
- `DialogueBubble` (glassmorphism, tail, animated in/out)
- `ChoiceStack` (2–4 button stack, large tap targets)
- `PrimaryActionButton` (Start/Queue)
- `StatusOverlay` (queue/search/waiting)
- `TimeoutBanner` (warning + timer)
- `ScreenFrame` (safe‑area padding + grain)

## Client Architecture (AGENTS + Vertical Slice)

- Feature‑first structure: `apps/client/src/features/*`
- Client is “dumb terminal”: server is source of truth
- Zod validation via `@romance/shared` for all IO
- Typed socket events; no `any`

## Suggested Folder Plan

- `apps/client/src/features/role/` (RoleSelect + API call)
- `apps/client/src/features/queue/` (Queue screen + join logic)
- `apps/client/src/features/search/` (PartnerFound + Start gate UI)
- `apps/client/src/features/session/` (Active flow, timeout states)
- `apps/client/src/features/content/` (script loading + validation)
- `apps/client/src/ui/` (shared UI components)
- `apps/client/src/state/` (reducer + selectors)
- `apps/client/src/api/` (HTTP + socket client)

## State Model (UI + Session)

- `uiState`:
  `ROLE_SELECT | QUEUE | PARTNER_FOUND | WAITING_FOR_START | ACTIVE_MY_TURN | ACTIVE_WAIT | TIMEOUT_WARN | SESSION_END | ERROR`
- `deviceId`, `role`, `sessionId`, `lastLine`, `choices`, `timerState`
- Server `SessionState` maps to UI state (server‑first)

## Networking Plan (P0‑01..P0‑03)

- On boot: generate/stash `deviceId` in localStorage
- Socket.io connect with auth `{ deviceId }`
- Role select: `POST /role` with `RoleSelectRequest`
- Queue join: `POST /queue/join`
- If `PARTNER_FOUND`: transition to Partner Found
- Reconnect: re‑issue `POST /queue/join` (idempotent)

## Content Loading (No‑Code Content)

- `apps/client/public/content/scenario.json`
- `apps/client/public/videos/*`
- Load via `fetch('/content/scenario.json', { cache: 'no-store' })`
- Validate with Zod schema
- Prefetch next video for smooth transitions

## Visual Implementation Notes

- Use `100dvh` + safe‑area inset padding
- `video` uses `playsInline`, `muted`, `loop`
- Gradient scrim for legibility; subtle noise overlay
- Buttons: large, high‑contrast, no default pill look

## Implementation Steps (Phased)

1. Replace `App.tsx` with app shell + `uiState` reducer
2. Global styles in `index.css`: fonts, palette vars, base layout
3. P0‑01: RoleSelect screen + `POST /role` + localStorage
4. P0‑02: Queue screen + `POST /queue/join` + socket hookup
5. P0‑03: PartnerFound screen + socket event transition
6. P0‑04+: Start gate + session placeholders
7. Content loader + mock scenario for UI demo

## Open Questions

- One shared aesthetic vs subtle role‑based accents?
- Confirm socket server availability for `partner_found`
- Confirm desired `scenario.json` format (can propose)
