import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { USER_ROLE } from '@romance/shared'
import { createDialogService } from './service'

const createTempDir = () => mkdtempSync(path.join(tmpdir(), 'romance-dialog-'))

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

  assert.throws(() =>
    createDialogService({ scenarioPath, videoDirectory: videoDir })
  )
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
    createDialogService({ scenarioPath, videoDirectory: videoDir })
  )
})
