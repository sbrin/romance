import test from 'node:test'
import assert from 'node:assert/strict'
import { USER_ROLE } from '@romance/shared'
import { appReducer, createInitialState } from './appReducer'

test('role selection moves to start search state', () => {
  const initial = createInitialState('device-12345678', null)
  const next = appReducer(initial, { type: 'ROLE_SELECTED', role: USER_ROLE.MALE })

  assert.equal(next.role, USER_ROLE.MALE)
  assert.equal(next.uiState, 'START_SEARCH')
  assert.equal(next.error, null)
})

test('partner_found sets session and state', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const next = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })

  assert.equal(next.uiState, 'PARTNER_FOUND')
  assert.equal(next.sessionId, 'session-abcdef12')
})

test('partner_cancelled clears session but keeps role', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(matched, {
    type: 'PARTNER_CANCELLED',
    sessionId: 'session-abcdef12',
  })

  assert.equal(next.uiState, 'PARTNER_CANCELLED')
  assert.equal(next.sessionId, null)
  assert.equal(next.role, USER_ROLE.MALE)
})

test('partner_cancelled works from session_started state', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const started = appReducer(matched, {
    type: 'SESSION_STARTED',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(started, {
    type: 'PARTNER_CANCELLED',
    sessionId: 'session-abcdef12',
  })

  assert.equal(next.uiState, 'PARTNER_CANCELLED')
  assert.equal(next.sessionId, null)
})

test('start_pressed moves to waiting for start', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(matched, { type: 'START_PRESSED' })

  assert.equal(next.uiState, 'WAITING_FOR_START')
  assert.equal(next.sessionId, 'session-abcdef12')
})

test('session_started moves to session started state', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const waiting = appReducer(matched, { type: 'START_PRESSED' })
  const next = appReducer(waiting, {
    type: 'SESSION_STARTED',
    sessionId: 'session-abcdef12',
  })

  assert.equal(next.uiState, 'SESSION_STARTED')
  assert.equal(next.sessionId, 'session-abcdef12')
})

test('session_step_received sets active state for current device', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(matched, {
    type: 'SESSION_STEP_RECEIVED',
    payload: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'He' },
      bubbleText: 'Привет',
      choices: [{ id: 'step-abcdef12', text: 'Да' }],
      videoUrl: 'm1.mp4',
      turnDeviceId: 'device-12345678',
    },
  })

  assert.equal(next.uiState, 'ACTIVE_MY_TURN')
  assert.equal(next.currentStep?.stepId, 'step-12345678')
  assert.equal(next.choices.length, 1)
})

test('session_step_received sets waiting state for other device', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(matched, {
    type: 'SESSION_STEP_RECEIVED',
    payload: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'She' },
      bubbleText: 'Привет',
      choices: [{ id: 'step-abcdef12', text: 'Да' }],
      videoUrl: 'f1.mp4',
      turnDeviceId: 'device-other',
    },
  })

  assert.equal(next.uiState, 'ACTIVE_WAIT')
  assert.equal(next.turnDeviceId, 'device-other')
})

test('start_failed returns to partner_found and sets error', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const waiting = appReducer(matched, { type: 'START_PRESSED' })
  const next = appReducer(waiting, {
    type: 'START_FAILED',
    message: 'Не удалось подтвердить старт.',
  })

  assert.equal(next.uiState, 'PARTNER_FOUND')
  assert.equal(next.error, 'Не удалось подтвердить старт.')
})

test('return_to_start clears session but keeps role', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const searching = appReducer(initial, { type: 'START_SEARCH' })
  const matched = appReducer(searching, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const next = appReducer(matched, { type: 'RETURN_TO_START' })

  assert.equal(next.uiState, 'START_SEARCH')
  assert.equal(next.sessionId, null)
  assert.equal(next.role, USER_ROLE.FEMALE)
})
