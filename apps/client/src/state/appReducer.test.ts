import test from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_END_REASON, USER_ROLE } from '@romance/shared'
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

test('partner_found works after queue resume even without role', () => {
  const initial = createInitialState('device-12345678', null)
  const queued = appReducer(initial, { type: 'QUEUE_JOINED' })
  const next = appReducer(queued, {
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
      choices: [{ id: '0', text: 'Да' }],
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
      choices: [{ id: '0', text: 'Да' }],
      videoUrl: 'f1.mp4',
      turnDeviceId: 'device-other',
    },
  })

  assert.equal(next.uiState, 'ACTIVE_WAIT')
  assert.equal(next.turnDeviceId, 'device-other')
})

test('session_resumed sets active state without prior session', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const next = appReducer(initial, {
    type: 'SESSION_RESUMED',
    payload: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'She' },
      bubbleText: 'Привет',
      choices: [{ id: '0', text: 'Да' }],
      videoUrl: 'f1.mp4',
      turnDeviceId: 'device-other',
    },
  })

  assert.equal(next.uiState, 'ACTIVE_WAIT')
  assert.equal(next.sessionId, 'session-abcdef12')
  assert.equal(next.currentStep?.stepId, 'step-12345678')
})

test('session_match_resumed restores partner found state', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const next = appReducer(initial, {
    type: 'SESSION_MATCH_RESUMED',
    sessionId: 'session-abcdef12',
    waitingForStart: false,
  })

  assert.equal(next.uiState, 'PARTNER_FOUND')
  assert.equal(next.sessionId, 'session-abcdef12')
})

test('session_match_resumed restores waiting state', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const next = appReducer(initial, {
    type: 'SESSION_MATCH_RESUMED',
    sessionId: 'session-abcdef12',
    waitingForStart: true,
  })

  assert.equal(next.uiState, 'WAITING_FOR_START')
  assert.equal(next.sessionId, 'session-abcdef12')
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

test('session_ended sets end state and reason', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const started = appReducer(matched, {
    type: 'SESSION_STARTED',
    sessionId: 'session-abcdef12',
  })
  const stepped = appReducer(started, {
    type: 'SESSION_STEP_RECEIVED',
    payload: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'She' },
      bubbleText: 'Финал',
      choices: [],
      videoUrl: 'final.mp4',
      turnDeviceId: 'device-12345678',
    },
  })
  const next = appReducer(stepped, {
    type: 'SESSION_ENDED',
    sessionId: 'session-abcdef12',
    reason: SESSION_END_REASON.COMPLETED,
  })

  assert.equal(next.uiState, 'SESSION_ENDED')
  assert.equal(next.sessionId, 'session-abcdef12')
  assert.equal(next.sessionEndReason, SESSION_END_REASON.COMPLETED)
  assert.equal(next.currentStep?.videoUrl, 'final.mp4')
})

test('return_to_queue clears session and moves to queue', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.FEMALE)
  const matched = appReducer(initial, {
    type: 'PARTNER_FOUND',
    sessionId: 'session-abcdef12',
  })
  const ended = appReducer(matched, {
    type: 'SESSION_ENDED',
    sessionId: 'session-abcdef12',
    reason: SESSION_END_REASON.COMPLETED,
  })
  const next = appReducer(ended, { type: 'RETURN_TO_QUEUE' })

  assert.equal(next.uiState, 'QUEUE')
  assert.equal(next.sessionId, null)
})

test('createInitialState restores active session for current device', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE, {
    sessionId: 'session-abcdef12',
    step: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'He' },
      bubbleText: 'Привет',
      choices: [{ id: '0', text: 'Да' }],
      videoUrl: 'm1.mp4',
      turnDeviceId: 'device-12345678',
    },
  })

  assert.equal(initial.uiState, 'ACTIVE_MY_TURN')
  assert.equal(initial.sessionId, 'session-abcdef12')
  assert.equal(initial.currentStep?.stepId, 'step-12345678')
})

test('createInitialState restores wait state for other device', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE, {
    sessionId: 'session-abcdef12',
    step: {
      sessionId: 'session-abcdef12',
      stepId: 'step-12345678',
      actor: { name: 'She' },
      bubbleText: 'Привет',
      choices: [{ id: '0', text: 'Да' }],
      videoUrl: 'f1.mp4',
      turnDeviceId: 'device-other',
    },
  })

  assert.equal(initial.uiState, 'ACTIVE_WAIT')
  assert.equal(initial.turnDeviceId, 'device-other')
})

test('createInitialState restores session_started when step missing', () => {
  const initial = createInitialState('device-12345678', USER_ROLE.MALE, {
    sessionId: 'session-abcdef12',
  })

  assert.equal(initial.uiState, 'SESSION_STARTED')
  assert.equal(initial.sessionId, 'session-abcdef12')
  assert.equal(initial.currentStep, null)
})
