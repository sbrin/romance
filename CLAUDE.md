# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Romance is a real-time interactive dialogue web application where two users (male/female) are matched and progress through a narrative-driven scenario with branching choices. Built as a Turbo monorepo with:

- **Client**: React 19 + Vite frontend
- **Server**: Fastify + Socket.io backend
- **Shared**: Zod schemas for type-safe contracts

The application is content-driven: scenarios are loaded from JSON files with video assets, allowing content updates without code changes.

## Development Commands

### Root Level (uses Turbo)
```bash
pnpm dev          # Run all packages in dev mode
pnpm build        # Build all packages
pnpm lint         # Lint all packages
pnpm test         # Run all tests
```

### Client (`apps/client`)
```bash
cd apps/client
pnpm dev          # Start Vite dev server
pnpm build        # Build for production (runs tsc + vite build)
pnpm lint         # Run ESLint
pnpm preview      # Preview production build
pnpm test         # Run tests with node --test
```

### Server (`apps/server`)
```bash
cd apps/server
pnpm dev          # Start server with tsx watch
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled server from dist/
pnpm test         # Run tests with node --test
```

### Shared Package (`packages/shared`)
```bash
cd packages/shared
pnpm build        # Build with tsup (CJS + ESM + types)
pnpm dev          # Build in watch mode
pnpm lint         # Type check with tsc --noEmit
pnpm test         # Run tests with node --test
```

### Running Single Test Files
```bash
# Use node --test with tsx for TypeScript support
node --test --import tsx "src/path/to/file.test.ts"
```

## Critical Architectural Concepts

### 1. Zod-First Validation

**All data crossing boundaries must be validated with Zod schemas from `@romance/shared`.**

- HTTP request/response bodies
- Socket.io event payloads
- localStorage persistence
- Scenario file loading

Never trust data from network, storage, or files. Always parse with Zod and handle validation errors.

### 2. Device ID as Primary Identity

Users are identified by a **persistent device ID** stored in localStorage:
- Generated once on first visit (UUID)
- Used for Socket.io authentication
- Links users to sessions and queue position
- Enables session recovery across page refreshes

**Critical**: Never clear device ID unless implementing logout. It's the only user identity mechanism.

### 3. Turn-Based Session Coordination

Sessions track whose turn it is:
- Scenario nodes specify actor (`He` or `She`)
- Actor maps to role (`MALE` or `FEMALE`)
- Server tracks `turnDeviceId` per session
- Non-turn users receive updates but cannot make choices
- POST `/session/step/answer` returns `NOOP` for wrong-turn requests

**When modifying session logic**: Always validate turn before allowing actions.

### 4. State Management Patterns

#### Client State Layers
- **UI State**: Managed by `appReducer.ts` (12 states: ROLE_SELECT → START_SEARCH → QUEUE → etc.)
- **Persistent State**: `storage.ts` saves device ID, role, session data to localStorage
- **Server State**: Mirrored via Socket.io events and HTTP responses

#### Server State (In-Memory Only)
- **No database**: All state in Maps/Objects in `core/store.ts`
- `users` Map: UserState per deviceId (role, sessionId, socketId, status)
- `sessions` Map: Session objects (paired users, current step, turn info)
- `queue` Record: FIFO arrays per role (MALE/FEMALE)

**Important**: Server restart loses all sessions. Not suitable for stateless deployments.

### 5. Scenario Structure

Scenarios are immutable graphs loaded at server startup:
- Defined in JSON (e.g., `assets/s1/s1.json`)
- Nodes have `id`, `prev[]`, `choices` (key=next step ID, value=text)
- Actor name (`He`/`She`) determines whose turn it is
- Video IDs map to MP4 files in `assets/s1/`
- Contract defined in `packages/shared/contracts-core-flow.md`

**Critical contract rule**: Always check `packages/shared/contracts-core-flow.md` before changing scenario handling or session flow.

### 6. Video Caching Per Role

Server caches last video URL per role to avoid redundant updates:
- Each step specifies `videoByRole: { male?: string, female?: string }`
- If video ID missing for a role, reuse previous video
- Client continues playing last video until explicitly updated
- Reduces bandwidth and provides smoother transitions

### 7. Session Recovery Flow

On app load, client checks localStorage and calls POST `/session/resume`:
- `ACTIVE`: Returns current step, client immediately restores session UI
- `FOUND`: Partner matched, show "Start" button
- `WAITING`: User confirmed start, waiting for partner
- `QUEUED`: Still in queue, show search screen
- `NONE`: No active session, show role selection

**When modifying flow**: Ensure all states are recoverable from server.

## Module Responsibilities

### Client (`apps/client/src`)

**`state/appReducer.ts`**: Core state machine
- 12 UI states with type-safe transitions
- All state changes must go through reducer actions
- Never mutate state directly

**`state/storage.ts`**: Persistent localStorage layer
- Safe getters/setters with Zod validation
- Handles serialization errors gracefully
- Used for device ID, role, and session recovery

**`api/http.ts`**: HTTP client wrapper
- `postJson()` validates responses against Zod schemas
- `sendBeaconJson()` for unload events (session cleanup)
- Custom error types for different failure modes

**`api/roleSync.ts`**: Role synchronization with retry
- Ensures role is saved to server before queue join
- Implements exponential backoff on failure
- Critical for session recovery flow

**`features/`**: Feature-specific UI components
- Colocated by feature (role selection, search, session)
- Each feature owns its UI logic and API calls

### Server (`apps/server/src`)

**`core/store.ts`**: In-memory data store
- Pure data structures (Maps, Objects, Arrays)
- All state access goes through exported functions
- Never export mutable references

**`core/socket.ts`**: Socket.io event hub
- Validates auth on connection (device ID)
- Maps device IDs to socket IDs for targeted emission
- All emit methods validate payloads against Zod schemas

**`modules/searching/service.ts`**: Queue and matching logic
- Pure functions: `joinQueueAndSearch()`, `cancelSearch()`
- Implements opposite-role matching (MALE + FEMALE)
- Returns success/error status for route handlers

**`modules/session/service.ts`**: Session lifecycle
- `createSession()`: Initializes new session for matched pair
- `confirmStart()`: Handles Start button confirmation flow
- Turn coordination and terminal node detection

**`modules/dialog/service.ts`**: Scenario management
- Loads and validates scenario JSON at startup
- Maps actor names to roles
- Generates role-specific video URLs
- Validates video files exist on disk

## Definition of Done

From `AGENTS.md`, all changes must satisfy:

0. Весь код покрыт юнит-тестами (All code covered by unit tests)
1. Код написан на TypeScript без `any` (TypeScript without `any`)
2. Входные данные валидируются через Zod (Zod validation for inputs)
3. Событие залогировано (Events logged in JSON format)
4. В каждом модуле есть актуальный README.md с функциональными требованиями (Module README with requirements)
5. Исправлены все предупреждения линтера (All linter warnings fixed)
6. Все тесты проходят (All tests pass)

## Testing Approach

**Framework**: Node's built-in `test` module with `tsx` for TypeScript support
**Runner**: `node --test --import tsx`
**Assertions**: `node:assert/strict`

**Test file conventions**:
- Files named `*.test.ts` colocated with implementation
- Pure functions tested directly (reducers, services)
- Side effects tested with mocks (FakeSocket, temp directories)
- Zod schemas tested with valid/invalid inputs
- State machines tested for all transitions and edge cases

**Example test patterns**:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('appReducer', () => {
  it('transitions from ROLE_SELECT to START_SEARCH', () => {
    const state = { uiState: 'ROLE_SELECT' as const };
    const action = { type: 'ROLE_SAVED' as const };
    const next = appReducer(state, action);
    assert.equal(next.uiState, 'START_SEARCH');
  });
});
```

## Common Patterns

### Adding a New HTTP Endpoint

1. Define request/response schemas in `packages/shared/src/index.ts`
2. Add route in appropriate module's `routes.ts` (e.g., `modules/session/routes.ts`)
3. Validate request body with `schema.safeParse()`
4. Call service function (pure logic)
5. Validate response before returning
6. Add test in `*.test.ts` file

### Adding a Socket.io Event

1. Add event name to `SOCKET_EVENT` enum in shared
2. Define event payload schema in shared
3. Add typed emit method in `core/socket.ts`
4. Validate payload on emit
5. Handle event in client with Zod validation
6. Dispatch appropriate reducer action

### Modifying Session Flow

1. **Check `packages/shared/contracts-core-flow.md` first**
2. Update state machine in `appReducer.ts` if client-side
3. Update session logic in `modules/session/service.ts` if server-side
4. Add tests for new state transitions
5. Update session recovery in `/session/resume` if needed
6. Verify socket event sequencing

### Adding Scenario Fields

1. Update schema in `packages/shared/src/index.ts`
2. Rebuild shared package: `cd packages/shared && pnpm build`
3. Update dialog service to handle new fields
4. Update client rendering logic
5. Add scenario validation tests
6. Update `contracts-core-flow.md` documentation

## Important Files to Check

- `packages/shared/contracts-core-flow.md`: Complete API contract specification
- `AGENTS.md`: Development rules and definition of done (in Russian)
- `docs/1-pitch-v1.0.md`: Product vision and requirements
- `apps/server/src/core/store.ts`: All server state structures
- `apps/client/src/state/appReducer.ts`: All client UI states

## TypeScript Configuration

All packages use strict TypeScript:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noFallthroughCasesInSwitch: true`

**Never use `any`**. Use `unknown` for truly unknown types and narrow with type guards.

## Deployment Notes

- Server is **stateful** (in-memory store) - requires sticky sessions or single instance
- Client is **static** - can be deployed to CDN
- Server serves video files from `assets/s1/` via Fastify static plugin
- Environment variables loaded via `dotenv` (see server code for specifics)
- No database setup required for V1

## Common Gotchas

1. **Shared package changes**: Always rebuild shared package after schema changes (`cd packages/shared && pnpm build`)
2. **Turn validation**: Never allow actions from non-turn users - always check `turnDeviceId`
3. **Device ID persistence**: Don't clear localStorage.deviceId unless implementing explicit logout
4. **Socket.io reconnection**: Device ID must be included in auth on every connection
5. **Video file paths**: Video IDs in scenario must match actual `.mp4` files in `assets/s1/`
6. **Queue idempotence**: Repeated `/queue/join` should not duplicate user in queue
7. **Session recovery**: Test with page refresh during every session state
8. **Zod errors**: Always handle `.safeParse()` error cases - never assume validation succeeds
