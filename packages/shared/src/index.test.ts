import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ScenarioNodeSchema,
  SessionStepEventSchema,
} from './index'

test('ScenarioNodeSchema accepts minimal node with passthrough fields', () => {
  const payload = {
    id: 'step-12345678',
    actor: { name: 'He', avatarPath: 'avatars/he.png', mood: 'calm' },
    text: 'Привет',
    prev: [],
    choices: { 'step-abcdef12': 'Да' },
    videoByRole: { male: 'm1', female: 'f1' },
    extraField: { nested: true },
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('ScenarioNodeSchema rejects invalid actor name', () => {
  const payload = {
    id: 'step-12345678',
    actor: { name: 'They' },
    text: 'Привет',
    prev: [],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, false)
})

test('SessionStepEventSchema validates event payload', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'She', avatarPath: 'avatars/she.png' },
    bubbleText: 'Привет',
    choices: [{ id: 'step-abcdef12', text: 'Да' }],
    videoUrl: 'f1.mp4',
    turnDeviceId: 'device-12345678',
  }

  const parsed = SessionStepEventSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})
