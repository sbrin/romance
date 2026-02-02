import test from 'node:test'
import assert from 'node:assert/strict'
import { clearStoredSession, getStoredSession, persistSession } from './storage'

const createMemoryStorage = () => {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}

test('persistSession stores and getStoredSession restores', () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage

  persistSession({
    sessionId: 'session-12345678',
    step: {
      sessionId: 'session-12345678',
      stepId: 'step-12345678',
      actor: { name: 'He' },
      bubbleText: 'Привет',
      choices: [{ id: '0', text: 'Да' }],
      videoUrl: 'm1.mp4',
      turnDeviceId: 'device-12345678',
    },
  })

  const stored = getStoredSession()
  assert.equal(stored?.sessionId, 'session-12345678')
  assert.equal(stored?.step?.stepId, 'step-12345678')
})

test('getStoredSession clears invalid payload', () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage

  storage.setItem('romance.session', '{"sessionId":"short"}')

  const stored = getStoredSession()
  assert.equal(stored, null)
  assert.equal(storage.getItem('romance.session'), null)
})

test('clearStoredSession removes cached session', () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage

  storage.setItem('romance.session', '{"sessionId":"session-12345678"}')
  clearStoredSession()

  assert.equal(storage.getItem('romance.session'), null)
})
