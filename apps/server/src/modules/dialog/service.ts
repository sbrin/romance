import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ASSETS_DIR, SCENARIOS } from '../../constants'
import {
  ScenarioNodeSchema,
  SessionStepEventSchema,
  USER_ROLE,
  type ScenarioActorName,
  type ScenarioNode,
  type SessionStepEvent,
  type StepId,
  type UserRole,
} from '@romance/shared'

type DialogServiceOptions = {
  scenarioPath?: string
  videoDirectory?: string
  logger?: DialogLogger
}

export type InternalNode = {
  id: StepId
  actor: { name: ScenarioActorName; avatarPath?: string }
  choices: Array<{ text: string; nextStepId: StepId }>
  videoByRole: { male?: string; female?: string }
  isTerminal: boolean
}

export type SessionStepBuildResult = {
  payload: SessionStepEvent
  videoUrl: string
}

export type DialogService = {
  rootStepId: StepId
  getStep: (stepId: StepId) => InternalNode
  createSessionStepEvent: (params: {
    sessionId: string
    stepId: StepId
    role: UserRole
    turnDeviceId: string
    previousVideoUrl?: string | null
    shouldPreload?: boolean
    bubbleText?: string
  }) => SessionStepBuildResult
  computePreloadVideoUrls: (params: { stepId: StepId; role: UserRole }) => string[]
  resolveChoiceToNextStep: (
    stepId: StepId,
    choiceIndex: number
  ) => { nextStepId: StepId; choiceText: string }
}

type DialogLogger = {
  error: (payload: Record<string, unknown>, message?: string) => void
}

const ScenarioDocumentSchema = z.record(z.string(), z.array(ScenarioNodeSchema))

type ScenarioData = {
  nodes: InternalNode[]
  byId: Map<string, InternalNode>
  rootStepId: StepId
}

type ScenarioIssueSummary = {
  path: string
  pathArray: (string | number)[]
  code: z.ZodIssue['code']
  message: string
}

const defaultLogger: DialogLogger = {
  error: (payload, message) => {
    const entry = {
      level: 'error',
      ts: new Date().toISOString(),
      ...payload,
      msg: message ?? 'error',
    }
    console.error(JSON.stringify(entry))
  },
}

const normalizeZodPath = (pathItems: ReadonlyArray<PropertyKey>): Array<string | number> =>
  pathItems.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment))

const formatZodPath = (pathItems: Array<string | number>): string => {
  if (pathItems.length === 0) return '(root)'
  return pathItems.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`
    if (acc === '') return String(segment)
    return `${acc}.${segment}`
  }, '')
}

const summarizeIssues = (issues: z.ZodIssue[]): ScenarioIssueSummary[] =>
  issues.map((issue) => {
    const normalizedPath = normalizeZodPath(issue.path)
    return {
      path: formatZodPath(normalizedPath),
      pathArray: normalizedPath,
      code: issue.code,
      message: issue.message,
    }
  })

const resolveScenarioPath = (override?: string): string => {
  if (override) return override
  const scenarioName = SCENARIOS[0]
  const scenarioPath = path.join(ASSETS_DIR, scenarioName, `${scenarioName}.json`)

  if (!existsSync(scenarioPath)) {
    throw new Error('SCENARIO_FILE_NOT_FOUND')
  }
  return scenarioPath
}

const resolveVideoDirectory = (override?: string): string => {
  if (override) return override
  const scenarioName = SCENARIOS[0]
  const videoDir = path.join(ASSETS_DIR, scenarioName)

  if (!existsSync(videoDir)) {
    throw new Error('VIDEO_DIRECTORY_NOT_FOUND')
  }
  return videoDir
}

const transformNode = (
  raw: ScenarioNode,
  scenarioName: string,
  isRoot: boolean
): InternalNode => {
  const isTerminal = raw.next === 'end'

  const choices: Array<{ text: string; nextStepId: StepId }> = []
  if (!isTerminal && Array.isArray(raw.next) && raw.data.choices) {
    for (let i = 0; i < raw.data.choices.length; i++) {
      choices.push({
        text: raw.data.choices[i],
        nextStepId: raw.next[i],
      })
    }
  }

  const videoByRole: { male?: string; female?: string } = {}
  if (isRoot) {
    videoByRole.male = `${scenarioName}f0`
    videoByRole.female = `${scenarioName}m0`
  } else {
    const videoField = raw.data.fields?.find((f) => f.fieldName === 'video')
    if (videoField) {
      const videoId = videoField.fieldValue.replace(/\.mp4$/, '')
      if (raw.actor.name === 'She') {
        videoByRole.female = videoId
      } else {
        videoByRole.male = videoId
      }
    }
  }

  return {
    id: raw.id,
    actor: { name: raw.actor.name, avatarPath: raw.actor.avatarPath },
    choices,
    videoByRole,
    isTerminal,
  }
}

const loadScenarioData = (
  scenarioPath: string,
  videoDirectory: string,
  logger: DialogLogger
): ScenarioData => {
  const raw = readFileSync(scenarioPath, 'utf-8')
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      { event: 'SCENARIO_INVALID_JSON', scenarioPath, errorMessage: message },
      'scenario_invalid_json'
    )
    throw new Error('SCENARIO_INVALID_JSON')
  }

  const parsed = ScenarioDocumentSchema.safeParse(parsedJson)
  if (!parsed.success) {
    logger.error(
      {
        event: 'SCENARIO_INVALID',
        scenarioPath,
        issues: summarizeIssues(parsed.error.issues),
        issueCount: parsed.error.issues.length,
      },
      'scenario_invalid'
    )
    throw new Error('SCENARIO_INVALID')
  }

  const entries = Object.entries(parsed.data)
  if (entries.length === 0) {
    throw new Error('SCENARIO_EMPTY')
  }

  const [, rawNodes] = entries[0]
  const scenarioName = path.basename(scenarioPath, '.json')

  const byId = new Map<string, InternalNode>()
  const nodes: InternalNode[] = []

  const rootRawSteps = rawNodes.filter((node) => node.prev.length === 0)
  if (rootRawSteps.length !== 1) {
    throw new Error('SCENARIO_ROOT_MISSING')
  }
  const rootRawStep = rootRawSteps[0]

  for (const rawNode of rawNodes) {
    const isRoot = rawNode.id === rootRawStep.id
    const node = transformNode(rawNode, scenarioName, isRoot)
    if (byId.has(node.id)) {
      throw new Error('SCENARIO_DUPLICATE_STEP')
    }
    byId.set(node.id, node)
    nodes.push(node)
  }

  const rootStep = byId.get(rootRawStep.id)!
  if (!rootStep.videoByRole.male || !rootStep.videoByRole.female) {
    throw new Error('SCENARIO_ROOT_VIDEO_REQUIRED')
  }

  const stats = statSync(videoDirectory)
  if (!stats.isDirectory()) {
    throw new Error('VIDEO_DIRECTORY_INVALID')
  }

  const videoIds = new Set<string>()
  for (const node of nodes) {
    if (node.videoByRole.male) videoIds.add(node.videoByRole.male)
    if (node.videoByRole.female) videoIds.add(node.videoByRole.female)
  }

  for (const videoId of videoIds) {
    const filename = `${videoId}.mp4`
    const videoPath = path.join(videoDirectory, filename)
    if (!existsSync(videoPath)) {
      throw new Error('VIDEO_FILE_NOT_FOUND ' + videoPath)
    }
  }

  return { nodes, byId, rootStepId: rootStep.id }
}

const mapRoleToVideoKey = (role: UserRole): 'male' | 'female' =>
  role === USER_ROLE.MALE ? 'male' : 'female'

const resolveVideoUrl = (
  step: InternalNode,
  role: UserRole,
  previousVideoUrl?: string | null
): string => {
  const key = mapRoleToVideoKey(role)
  const videoId = step.videoByRole[key]
  if (videoId) {
    return `${videoId}.mp4`
  }
  if (previousVideoUrl) {
    return previousVideoUrl
  }
  throw new Error('VIDEO_URL_MISSING')
}

const mapChoices = (choices: InternalNode['choices']) => {
  return choices.map((choice, index) => ({
    id: String(index),
    text: choice.text,
  }))
}

export const createDialogService = (options: DialogServiceOptions = {}): DialogService => {
  const scenarioPath = resolveScenarioPath(options.scenarioPath)
  const videoDirectory = resolveVideoDirectory(options.videoDirectory)
  const logger = options.logger ?? defaultLogger
  const scenario = loadScenarioData(scenarioPath, videoDirectory, logger)

  const computePreloadVideoUrls = (params: { stepId: StepId; role: UserRole }): string[] => {
    const step = scenario.byId.get(params.stepId)
    if (!step || step.choices.length === 0) {
      return []
    }

    const roleKey = mapRoleToVideoKey(params.role)
    const videoUrls: string[] = []
    const seen = new Set<string>()

    for (const choice of step.choices) {
      if (seen.has(choice.nextStepId)) continue
      seen.add(choice.nextStepId)

      const nextStep = scenario.byId.get(choice.nextStepId)
      if (!nextStep) continue

      const videoId = nextStep.videoByRole[roleKey]
      if (videoId) {
        videoUrls.push(`${videoId}.mp4`)
      }
    }

    return videoUrls
  }

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
      shouldPreload = false,
      bubbleText = '',
    }) => {
      const step = scenario.byId.get(stepId)
      if (!step) {
        throw new Error('STEP_NOT_FOUND')
      }
      const videoUrl = resolveVideoUrl(step, role, previousVideoUrl)

      const preloadVideoUrls = shouldPreload
        ? computePreloadVideoUrls({ stepId, role })
        : undefined

      const payload = SessionStepEventSchema.parse({
        sessionId,
        stepId: step.id,
        actor: {
          name: step.actor.name,
          avatarPath: step.actor.avatarPath,
        },
        bubbleText,
        choices: mapChoices(step.choices),
        videoUrl,
        turnDeviceId,
        preloadVideoUrls,
      })
      return { payload, videoUrl }
    },
    resolveChoiceToNextStep: (stepId, choiceIndex) => {
      const step = scenario.byId.get(stepId)
      if (!step) {
        throw new Error('STEP_NOT_FOUND')
      }
      if (choiceIndex < 0 || choiceIndex >= step.choices.length) {
        throw new Error('INVALID_CHOICE')
      }
      return {
        nextStepId: step.choices[choiceIndex].nextStepId,
        choiceText: step.choices[choiceIndex].text,
      }
    },
    computePreloadVideoUrls,
  }
}
