import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { USER_ROLE } from '@romance/shared'
import { createDialogService } from './service'

const createTempDir = () => mkdtempSync(path.join(tmpdir(), 'romance-dialog-'))

const createLoggerSpy = () => {
  const calls: Array<{ payload: Record<string, unknown>; message?: string }> = []
  const logger = {
    error: (payload: Record<string, unknown>, message?: string) => {
      calls.push({ payload, message })
    },
  }
  return { logger, calls }
}

const writeScenario = (dir: string, scenario: unknown, filename = 'scenario.json') => {
  const filePath = path.join(dir, filename)
  writeFileSync(filePath, JSON.stringify(scenario, null, 2))
  return filePath
}

const writeVideo = (dir: string, videoId: string) => {
  writeFileSync(path.join(dir, `${videoId}.mp4`), '')
}

test('dialog loader validates new-format scenario and builds session_step payloads', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  // Root auto-generates video from scenario name: scenario -> scenariom0 / scenariof0
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')
  writeVideo(videoDir, 's1m1')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: {
          actor: { name: 'He' },
          choices: ['Да', 'Нет'],
        },
        actor: { name: 'He' },
        text: '',
        next: ['step-abcdef12', 'step-abcdef12'],
        prev: [],
      },
      {
        id: 'step-abcdef12',
        data: {
          actor: { name: 'She' },
          choices: ['Ответ'],
          fields: [{ fieldName: 'video', fieldValue: 's1m1.mp4' }],
        },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-12345678'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const dialogService = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  assert.equal(dialogService.rootStepId, 'step-12345678')

  const result = dialogService.createSessionStepEvent({
    sessionId: 'session-12345678',
    stepId: dialogService.rootStepId,
    role: USER_ROLE.MALE,
    turnDeviceId: 'device-12345678',
  })

  // Root auto-generated male video: scenariof0 (swapped)
  assert.equal(result.payload.videoUrl, 'scenariof0.mp4')
  assert.equal(result.payload.choices.length, 2)
  assert.equal(result.payload.choices[0].id, '0')
  assert.equal(result.payload.choices[0].text, 'Да')
  assert.equal(result.payload.choices[1].id, '1')
  assert.equal(result.payload.choices[1].text, 'Нет')
  assert.equal(result.payload.bubbleText, '')
})

test('dialog loader derives videoByRole from actor and single video', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')
  writeVideo(videoDir, 's1m1')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: { actor: { name: 'He' }, choices: ['Да'] },
        actor: { name: 'He' },
        text: '',
        next: ['step-abcdef12'],
        prev: [],
      },
      {
        id: 'step-abcdef12',
        data: {
          actor: { name: 'She' },
          fields: [{ fieldName: 'video', fieldValue: 's1m1.mp4' }],
        },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-12345678'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  // Actor "She" + video "s1m1" → female sees it (swapped)
  const maleResult = service.createSessionStepEvent({
    sessionId: 'session-12345678',
    stepId: 'step-abcdef12',
    role: USER_ROLE.MALE,
    turnDeviceId: 'device-12345678',
    previousVideoUrl: 'scenariof0.mp4',
  })
  // Male has no video on this node (it's for female) → falls back to previous
  assert.equal(maleResult.payload.videoUrl, 'scenariof0.mp4')

  const femaleResult = service.createSessionStepEvent({
    sessionId: 'session-12345678',
    stepId: 'step-abcdef12',
    role: USER_ROLE.FEMALE,
    turnDeviceId: 'device-12345678',
    previousVideoUrl: 'scenariom0.mp4',
  })
  assert.equal(femaleResult.payload.videoUrl, 's1m1.mp4')
})

test('dialog loader rejects invalid scenario', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: { actor: { name: 'They' } },
        actor: { name: 'They' },
        text: '',
        next: 'end',
        prev: [],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const { logger, calls } = createLoggerSpy()

  assert.throws(() =>
    createDialogService({ scenarioPath, videoDirectory: videoDir, logger })
  )

  const [firstCall] = calls
  assert.ok(firstCall)
  const payload = firstCall.payload as { event?: unknown; issues?: unknown }
  assert.equal(payload.event, 'SCENARIO_INVALID')
  assert.ok(Array.isArray(payload.issues))
})

test('dialog loader fails when video file is missing', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  // Missing scenariof0

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: { actor: { name: 'He' } },
        actor: { name: 'He' },
        text: '',
        next: 'end',
        prev: [],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)

  assert.throws(() =>
    createDialogService({
      scenarioPath,
      videoDirectory: videoDir,
      logger: { error: () => { } },
    })
  )
})

test('dialog loader logs invalid json details', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  const scenarioPath = path.join(baseDir, 'scenario.json')
  writeFileSync(scenarioPath, '{"scenario": [')
  const { logger, calls } = createLoggerSpy()

  assert.throws(() =>
    createDialogService({ scenarioPath, videoDirectory: videoDir, logger })
  )

  const [firstCall] = calls
  assert.ok(firstCall)
  const payload = firstCall.payload as { event?: unknown; errorMessage?: unknown }
  assert.equal(payload.event, 'SCENARIO_INVALID_JSON')
  assert.equal(typeof payload.errorMessage, 'string')
})

test('computePreloadVideoUrls returns video URLs for next steps', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')
  writeVideo(videoDir, 's1m2')
  writeVideo(videoDir, 's1m3')

  const scenario = {
    conv1: [
      {
        id: 'step-11111111',
        data: {
          actor: { name: 'He' },
          choices: ['Да', 'Нет'],
        },
        actor: { name: 'He' },
        text: '',
        next: ['step-2a222222', 'step-2b333333'],
        prev: [],
      },
      {
        id: 'step-2a222222',
        data: {
          actor: { name: 'She' },
          fields: [{ fieldName: 'video', fieldValue: 's1m2.mp4' }],
        },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-11111111'],
      },
      {
        id: 'step-2b333333',
        data: {
          actor: { name: 'She' },
          fields: [{ fieldName: 'video', fieldValue: 's1m3.mp4' }],
        },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-11111111'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  // Actor "She" nodes → video goes to female (swapped)
  const urls = service.computePreloadVideoUrls({
    stepId: 'step-11111111',
    role: USER_ROLE.FEMALE,
  })

  assert.deepEqual(urls, ['s1m2.mp4', 's1m3.mp4'])
})

test('computePreloadVideoUrls deduplicates when choices point to same step', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')

  const scenario = {
    conv1: [
      {
        id: 'step-11111111',
        data: {
          actor: { name: 'He' },
          choices: ['Да', 'Нет', 'Может'],
        },
        actor: { name: 'He' },
        text: '',
        next: ['step-22222222', 'step-22222222', 'step-22222222'],
        prev: [],
      },
      {
        id: 'step-22222222',
        data: { actor: { name: 'She' } },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-11111111'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  const urls = service.computePreloadVideoUrls({
    stepId: 'step-11111111',
    role: USER_ROLE.MALE,
  })

  // step-22222222 has no video for male, so empty — but importantly no duplicates
  assert.deepEqual(urls, [])
})

test('computePreloadVideoUrls returns empty array for terminal steps', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: {
          actor: { name: 'He' },
          choices: ['Да'],
        },
        actor: { name: 'He' },
        text: '',
        next: 'end',
        prev: [],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  const urls = service.computePreloadVideoUrls({
    stepId: 'step-12345678',
    role: USER_ROLE.MALE,
  })

  assert.deepEqual(urls, [])
})

test('resolveChoiceToNextStep returns correct nextStepId and choiceText', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: {
          actor: { name: 'He' },
          choices: ['Первый', 'Второй', 'Третий'],
        },
        actor: { name: 'He' },
        text: '',
        next: ['step-aaaaaaaa', 'step-bbbbbbbb', 'step-aaaaaaaa'],
        prev: [],
      },
      {
        id: 'step-aaaaaaaa',
        data: { actor: { name: 'She' } },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-12345678'],
      },
      {
        id: 'step-bbbbbbbb',
        data: { actor: { name: 'She' } },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-12345678'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  const choice0 = service.resolveChoiceToNextStep('step-12345678', 0)
  assert.equal(choice0.nextStepId, 'step-aaaaaaaa')
  assert.equal(choice0.choiceText, 'Первый')

  const choice1 = service.resolveChoiceToNextStep('step-12345678', 1)
  assert.equal(choice1.nextStepId, 'step-bbbbbbbb')
  assert.equal(choice1.choiceText, 'Второй')

  const choice2 = service.resolveChoiceToNextStep('step-12345678', 2)
  assert.equal(choice2.nextStepId, 'step-aaaaaaaa')
  assert.equal(choice2.choiceText, 'Третий')

  assert.throws(() => service.resolveChoiceToNextStep('step-12345678', 3))
  assert.throws(() => service.resolveChoiceToNextStep('step-12345678', -1))
})

test('createSessionStepEvent uses bubbleText parameter', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: { actor: { name: 'He' } },
        actor: { name: 'He' },
        text: '',
        next: 'end',
        prev: [],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  const result = service.createSessionStepEvent({
    sessionId: 'session-12345678',
    stepId: 'step-12345678',
    role: USER_ROLE.MALE,
    turnDeviceId: 'device-12345678',
    bubbleText: 'Выбранный текст',
  })

  assert.equal(result.payload.bubbleText, 'Выбранный текст')
})

test('dialog loader strips .mp4 extension from video fieldValue', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'scenariom0')
  writeVideo(videoDir, 'scenariof0')
  writeVideo(videoDir, 's1m1')

  const scenario = {
    conv1: [
      {
        id: 'step-12345678',
        data: { actor: { name: 'He' }, choices: ['Да'] },
        actor: { name: 'He' },
        text: '',
        next: ['step-abcdef12'],
        prev: [],
      },
      {
        id: 'step-abcdef12',
        data: {
          actor: { name: 'She' },
          fields: [{ fieldName: 'video', fieldValue: 's1m1.mp4' }],
        },
        actor: { name: 'She' },
        text: '',
        next: 'end',
        prev: ['step-12345678'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => { } },
  })

  const step = service.getStep('step-abcdef12')
  assert.equal(step.videoByRole.female, 's1m1')
  assert.equal(step.videoByRole.male, undefined)
})
