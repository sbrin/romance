import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  ScenarioNodeSchema,
  SessionStepEventSchema,
  USER_ROLE,
  type ScenarioNode,
  type SessionStepEvent,
  type StepId,
  type UserRole,
} from '@romance/shared'

type DialogServiceOptions = {
  scenarioPath?: string
  videoDirectory?: string
}

export type SessionStepBuildResult = {
  payload: SessionStepEvent
  videoUrl: string
}

export type DialogService = {
  rootStepId: StepId
  getStep: (stepId: StepId) => ScenarioNode
  createSessionStepEvent: (params: {
    sessionId: string
    stepId: StepId
    role: UserRole
    turnDeviceId: string
    previousVideoUrl?: string | null
  }) => SessionStepBuildResult
}

const ScenarioDocumentSchema = z.record(z.string(), z.array(ScenarioNodeSchema))

type ScenarioData = {
  nodes: ScenarioNode[]
  byId: Map<string, ScenarioNode>
  rootStepId: StepId
}

const resolveScenarioPath = (override?: string): string => {
  if (override) return override
  const candidates = [
    path.resolve(process.cwd(), 'assets/s1/s1.json'),
    path.resolve(process.cwd(), '../../assets/s1/s1.json'),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('SCENARIO_FILE_NOT_FOUND')
  }
  return found
}

const resolveVideoDirectory = (override?: string): string => {
  if (override) return override
  const candidates = [
    path.resolve(process.cwd(), 'assets/s1'),
    path.resolve(process.cwd(), '../../assets/s1'),
  ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('VIDEO_DIRECTORY_NOT_FOUND')
  }
  return found
}

const loadScenarioData = (scenarioPath: string, videoDirectory: string): ScenarioData => {
  const raw = readFileSync(scenarioPath, 'utf-8')
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new Error('SCENARIO_INVALID_JSON')
  }

  const parsed = ScenarioDocumentSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error('SCENARIO_INVALID')
  }

  const entries = Object.entries(parsed.data)
  if (entries.length === 0) {
    throw new Error('SCENARIO_EMPTY')
  }

  const [, nodes] = entries[0]
  const byId = new Map<string, ScenarioNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) {
      throw new Error('SCENARIO_DUPLICATE_STEP')
    }
    byId.set(node.id, node)
  }

  const rootSteps = nodes.filter((node) => node.prev.length === 0)
  if (rootSteps.length !== 1) {
    throw new Error('SCENARIO_ROOT_MISSING')
  }
  const rootStep = rootSteps[0]

  if (!rootStep.videoByRole?.male || !rootStep.videoByRole?.female) {
    throw new Error('SCENARIO_ROOT_VIDEO_REQUIRED')
  }

  const stats = statSync(videoDirectory)
  if (!stats.isDirectory()) {
    throw new Error('VIDEO_DIRECTORY_INVALID')
  }

  const videoIds = new Set<string>()
  for (const node of nodes) {
    if (node.videoByRole?.male) videoIds.add(node.videoByRole.male)
    if (node.videoByRole?.female) videoIds.add(node.videoByRole.female)
  }

  for (const videoId of videoIds) {
    const filename = `${videoId}.mp4`
    const videoPath = path.join(videoDirectory, filename)
    if (!existsSync(videoPath)) {
      throw new Error('VIDEO_FILE_NOT_FOUND')
    }
  }

  return { nodes, byId, rootStepId: rootStep.id }
}

const mapRoleToVideoKey = (role: UserRole): 'male' | 'female' =>
  role === USER_ROLE.MALE ? 'male' : 'female'

const resolveVideoUrl = (
  step: ScenarioNode,
  role: UserRole,
  previousVideoUrl?: string | null
): string => {
  const key = mapRoleToVideoKey(role)
  const videoId = step.videoByRole?.[key]
  if (videoId) {
    return `${videoId}.mp4`
  }
  if (previousVideoUrl) {
    return previousVideoUrl
  }
  throw new Error('VIDEO_URL_MISSING')
}

const mapChoices = (choices?: Record<string, string>) => {
  if (!choices) return []
  return Object.entries(choices).map(([id, text]) => ({ id, text }))
}

export const createDialogService = (options: DialogServiceOptions = {}): DialogService => {
  const scenarioPath = resolveScenarioPath(options.scenarioPath)
  const videoDirectory = resolveVideoDirectory(options.videoDirectory)
  const scenario = loadScenarioData(scenarioPath, videoDirectory)

  return {
    rootStepId: scenario.rootStepId,
    getStep: (stepId) => {
      const step = scenario.byId.get(stepId)
      if (!step) {
        throw new Error('STEP_NOT_FOUND')
      }
      return step
    },
    createSessionStepEvent: ({
      sessionId,
      stepId,
      role,
      turnDeviceId,
      previousVideoUrl,
    }) => {
      const step = scenario.byId.get(stepId)
      if (!step) {
        throw new Error('STEP_NOT_FOUND')
      }
      const videoUrl = resolveVideoUrl(step, role, previousVideoUrl)
      const payload = SessionStepEventSchema.parse({
        sessionId,
        stepId: step.id,
        actor: {
          name: step.actor.name,
          avatarPath: step.actor.avatarPath,
        },
        bubbleText: step.text,
        choices: mapChoices(step.choices),
        videoUrl,
        turnDeviceId,
      })
      return { payload, videoUrl }
    },
  }
}
