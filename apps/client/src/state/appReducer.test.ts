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
