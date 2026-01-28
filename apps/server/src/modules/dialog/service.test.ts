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

const writeScenario = (dir: string, scenario: unknown) => {
  const filePath = path.join(dir, 'scenario.json')
  writeFileSync(filePath, JSON.stringify(scenario, null, 2))
  return filePath
}

const writeVideo = (dir: string, videoId: string) => {
  writeFileSync(path.join(dir, `${videoId}.mp4`), '')
}

test('dialog loader validates scenario and builds session_step payloads', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'm1')
  writeVideo(videoDir, 'f1')

  const scenario = {
    scenario: [
      {
        id: 'step-12345678',
        actor: { name: 'He' },
        text: 'Привет',
        prev: [],
        choices: { 'step-abcdef12': 'Да' },
        videoByRole: { male: 'm1', female: 'f1' },
      },
      {
        id: 'step-abcdef12',
        actor: { name: 'She' },
        text: 'Ответ',
        prev: ['step-12345678'],
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const dialogService = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => {} },
  })

  assert.equal(dialogService.rootStepId, 'step-12345678')

  const result = dialogService.createSessionStepEvent({
    sessionId: 'session-12345678',
    stepId: dialogService.rootStepId,
    role: USER_ROLE.MALE,
    turnDeviceId: 'device-12345678',
  })

  assert.equal(result.payload.videoUrl, 'm1.mp4')
  assert.equal(result.payload.choices.length, 1)
})

test('dialog loader rejects invalid scenario', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'm1')
  writeVideo(videoDir, 'f1')

  const scenario = {
    scenario: [
      {
        id: 'step-12345678',
        actor: { name: 'They' },
        text: 'Привет',
        prev: [],
        videoByRole: { male: 'm1', female: 'f1' },
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
  const [issue] = payload.issues as Array<{ path?: unknown }>
  assert.ok(issue)
  if (typeof issue.path !== 'string') {
    assert.fail('Expected issue.path to be a string')
  }
  assert.ok(issue.path.includes('scenario'))
})

test('dialog loader fails when video file is missing', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'm1')

  const scenario = {
    scenario: [
      {
        id: 'step-12345678',
        actor: { name: 'He' },
        text: 'Привет',
        prev: [],
        videoByRole: { male: 'm1', female: 'missing' },
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)

  assert.throws(() =>
    createDialogService({
      scenarioPath,
      videoDirectory: videoDir,
      logger: { error: () => {} },
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
  writeVideo(videoDir, 'f1')
  writeVideo(videoDir, 'm1')
  writeVideo(videoDir, 'f2')
  writeVideo(videoDir, 'm2')
  writeVideo(videoDir, 'f3')
  writeVideo(videoDir, 'm3')

  const scenario = {
    scenario: [
      {
        id: 'step-11111111',
        actor: { name: 'He' },
        text: 'Привет',
        prev: [],
        choices: { 'step-2a222222': 'Да', 'step-2b333333': 'Нет' },
        videoByRole: { male: 'f1', female: 'm1' },
      },
      {
        id: 'step-2a222222',
        actor: { name: 'She' },
        text: 'Круто',
        prev: ['step-11111111'],
        videoByRole: { male: 'f2', female: 'm2' },
      },
      {
        id: 'step-2b333333',
        actor: { name: 'She' },
        text: 'Окей',
        prev: ['step-11111111'],
        videoByRole: { male: 'f3', female: 'm3' },
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => {} },
  })

  const urls = service.computePreloadVideoUrls({
    stepId: 'step-11111111',
    role: USER_ROLE.MALE,
  })

  assert.deepEqual(urls, ['f2.mp4', 'f3.mp4'])
})

test('computePreloadVideoUrls returns empty array for terminal steps', () => {
  const baseDir = createTempDir()
  const videoDir = path.join(baseDir, 'videos')
  mkdirSync(videoDir)
  writeVideo(videoDir, 'f1')
  writeVideo(videoDir, 'm1')

  const scenario = {
    scenario: [
      {
        id: 'step-12345678',
        actor: { name: 'He' },
        text: 'Привет',
        prev: [],
        choices: {},
        videoByRole: { male: 'f1', female: 'm1' },
      },
    ],
  }

  const scenarioPath = writeScenario(baseDir, scenario)
  const service = createDialogService({
    scenarioPath,
    videoDirectory: videoDir,
    logger: { error: () => {} },
  })

  const urls = service.computePreloadVideoUrls({
    stepId: 'step-12345678',
    role: USER_ROLE.MALE,
  })

  assert.deepEqual(urls, [])
})
