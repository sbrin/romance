import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ScenarioNodeSchema,
  SessionStepEventSchema,
} from './index'

test('ScenarioNodeSchema accepts node in new editor format', () => {
  const payload = {
    type: 'Text',
    id: 'step-12345678',
    nodeType: 'dialogNode',
    data: {
      actor: { name: 'He', avatarPath: 'avatars/he.png', mood: 'calm' },
      speech: '',
      actorList: [{ name: 'She' }, { name: 'He' }],
      fieldList: [{ name: 'video', type: 'string' }],
      choices: ['Да', 'Нет'],
      fields: [{ fieldName: 'video', fieldValue: 's1m1.mp4' }],
    },
    actor: { name: 'He', avatarPath: 'avatars/he.png', mood: 'calm' },
    text: '',
    next: ['step-abcdef12', 'step-bbccdd12'],
    prev: [],
    extraField: { nested: true },
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('ScenarioNodeSchema accepts terminal node with next: end', () => {
  const payload = {
    id: 'step-12345678',
    data: {
      actor: { name: 'She' },
      choices: ['Вариант 1', 'Вариант 2'],
    },
    actor: { name: 'She' },
    text: '',
    next: 'end',
    prev: ['step-abcdef12'],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('ScenarioNodeSchema accepts terminal node with string actor when next: end', () => {
  const payload = {
    id: 'step-12345678',
    data: {
      actor: 'Some string',
    },
    actor: 'Some string',
    text: '',
    next: 'end',
    prev: ['step-abcdef12'],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, true, 'Should accept string actor when next is end')
})

test('ScenarioNodeSchema rejects string actor when next is not end', () => {
  const payload = {
    id: 'step-12345678',
    data: {
      actor: 'Some string',
    },
    actor: 'Some string',
    text: '',
    next: ['step-87654321'],
    prev: [],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, false, 'Should reject string actor when next is not end')
})

test('ScenarioNodeSchema rejects invalid actor name', () => {
  const payload = {
    id: 'step-12345678',
    data: { actor: { name: 'They' } },
    actor: { name: 'They' },
    text: '',
    next: 'end',
    prev: [],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, false)
})

test('ScenarioNodeSchema accepts waiter actor name', () => {
  const payload = {
    id: 'step-12345678',
    data: { actor: { name: 'waiter' } },
    actor: { name: 'waiter' },
    text: 'Принес счет',
    next: 'end',
    prev: ['step-abcdef12'],
  }

  const parsed = ScenarioNodeSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('SessionStepEventSchema validates event payload with index-based choice IDs', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'She', avatarPath: 'avatars/she.png' },
    bubbleText: 'Привет',
    choices: [{ id: '0', text: 'Да' }, { id: '1', text: 'Нет' }],
    videoUrl: 'f1.mp4',
    turnDeviceId: 'device-12345678',
  }

  const parsed = SessionStepEventSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('SessionStepEventSchema accepts preloadVideoUrls', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'She', avatarPath: 'avatars/she.png' },
    bubbleText: 'Привет',
    choices: [{ id: '0', text: 'Да' }],
    videoUrl: 'f1.mp4',
    turnDeviceId: 'device-12345678',
    preloadVideoUrls: ['f2.mp4', 'f3.mp4'],
  }

  const parsed = SessionStepEventSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})

test('SessionStepEventSchema rejects non-numeric choice id', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'She' },
    bubbleText: '',
    choices: [{ id: 'step-abcdef12', text: 'Да' }],
    videoUrl: 'f1.mp4',
    turnDeviceId: 'device-12345678',
  }

  const parsed = SessionStepEventSchema.safeParse(payload)
  assert.equal(parsed.success, false)
})

test('SessionStepEventSchema accepts waiter actor in payload', () => {
  const payload = {
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    actor: { name: 'waiter' },
    bubbleText: '',
    choices: [],
    videoUrl: 'w_1.mp4',
    turnDeviceId: 'device-12345678',
  }

  const parsed = SessionStepEventSchema.safeParse(payload)
  assert.equal(parsed.success, true)
})
