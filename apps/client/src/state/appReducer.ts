import type { SessionStepEvent, UserRole } from '@romance/shared'

export type UiState =
  | 'ROLE_SELECT'
  | 'START_SEARCH'
  | 'QUEUE'
  | 'PARTNER_FOUND'
  | 'WAITING_FOR_START'
  | 'SESSION_STARTED'
  | 'ACTIVE_MY_TURN'
  | 'ACTIVE_WAIT'
  | 'PARTNER_CANCELLED'

export type SessionStepState = {
  stepId: string
  actor: SessionStepEvent['actor']
  bubbleText: string
  videoUrl: string
}

export type AppState = {
  deviceId: string
  role: UserRole | null
  sessionId: string | null
  uiState: UiState
  error: string | null
  currentStep: SessionStepState | null
  choices: SessionStepEvent['choices']
  turnDeviceId: string | null
}

export type AppAction =
  | { type: 'ROLE_SELECTED'; role: UserRole }
  | { type: 'START_SEARCH' }
  | { type: 'QUEUE_JOINED' }
  | { type: 'RETURN_TO_START'; error?: string | null }
  | { type: 'PARTNER_FOUND'; sessionId: string }
  | { type: 'PARTNER_CANCELLED'; sessionId: string }
  | { type: 'START_PRESSED' }
  | { type: 'START_FAILED'; message: string }
  | { type: 'SESSION_STARTED'; sessionId: string }
  | { type: 'SESSION_STEP_RECEIVED'; payload: SessionStepEvent }
  | { type: 'SESSION_RESUMED'; payload: SessionStepEvent }
  | { type: 'SESSION_MATCH_RESUMED'; sessionId: string; waitingForStart: boolean }
  | { type: 'ROLE_REQUIRED' }
  | { type: 'ERROR'; message: string }

export type ResumeSession = {
  sessionId: string
  step?: SessionStepEvent
}

export const createInitialState = (
  deviceId: string,
  role: UserRole | null,
  resumeSession?: ResumeSession | null
): AppState => {
  if (resumeSession?.sessionId) {
    if (resumeSession.step) {
      const isMyTurn = resumeSession.step.turnDeviceId === deviceId
      return {
        deviceId,
        role,
        sessionId: resumeSession.sessionId,
        uiState: isMyTurn ? 'ACTIVE_MY_TURN' : 'ACTIVE_WAIT',
        error: null,
        currentStep: {
          stepId: resumeSession.step.stepId,
          actor: resumeSession.step.actor,
          bubbleText: resumeSession.step.bubbleText,
          videoUrl: resumeSession.step.videoUrl,
        },
        choices: resumeSession.step.choices,
        turnDeviceId: resumeSession.step.turnDeviceId,
      }
    }

    return {
      deviceId,
      role,
      sessionId: resumeSession.sessionId,
      uiState: 'SESSION_STARTED',
      error: null,
      currentStep: null,
      choices: [],
      turnDeviceId: null,
    }
  }

  return {
    deviceId,
    role,
    sessionId: null,
    uiState: role ? 'START_SEARCH' : 'ROLE_SELECT',
    error: null,
    currentStep: null,
    choices: [],
    turnDeviceId: null,
  }
}

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'ROLE_SELECTED':
      return {
        ...state,
        role: action.role,
        uiState: 'START_SEARCH',
        error: null,
      }
    case 'START_SEARCH':
      if (!state.role) {
        return state
      }
      return {
        ...state,
        uiState: 'QUEUE',
        error: null,
      }
    case 'QUEUE_JOINED':
      return {
        ...state,
        uiState: 'QUEUE',
        error: null,
      }
    case 'RETURN_TO_START':
      return {
        ...state,
        sessionId: null,
        uiState: state.role ? 'START_SEARCH' : 'ROLE_SELECT',
        error: action.error ?? null,
        currentStep: null,
        choices: [],
        turnDeviceId: null,
      }
    case 'PARTNER_FOUND':
      if (state.uiState !== 'QUEUE' && state.uiState !== 'START_SEARCH') {
        return state
      }
      return {
        ...state,
        sessionId: action.sessionId,
        uiState: 'PARTNER_FOUND',
        error: null,
      }
    case 'PARTNER_CANCELLED': {
      const cancellableStates: UiState[] = [
        'PARTNER_FOUND',
        'WAITING_FOR_START',
        'SESSION_STARTED',
        'ACTIVE_MY_TURN',
        'ACTIVE_WAIT',
      ]
      if (!cancellableStates.includes(state.uiState) || state.sessionId !== action.sessionId) {
        return state
      }
      return {
        ...state,
        sessionId: null,
        uiState: 'PARTNER_CANCELLED',
        error: null,
        currentStep: null,
        choices: [],
        turnDeviceId: null,
      }
    }
    case 'START_PRESSED':
      if (state.uiState !== 'PARTNER_FOUND' || !state.sessionId) {
        return state
      }
      return {
        ...state,
        uiState: 'WAITING_FOR_START',
        error: null,
      }
    case 'START_FAILED':
      return {
        ...state,
        uiState: 'PARTNER_FOUND',
        error: action.message,
      }
    case 'SESSION_STARTED':
      if (
        state.sessionId !== action.sessionId ||
        (state.uiState !== 'PARTNER_FOUND' && state.uiState !== 'WAITING_FOR_START')
      ) {
        return state
      }
      return {
        ...state,
        uiState: 'SESSION_STARTED',
        error: null,
      }
    case 'SESSION_STEP_RECEIVED':
      if (!state.sessionId || state.sessionId !== action.payload.sessionId) {
        return state
      }
      return {
        ...state,
        uiState:
          action.payload.turnDeviceId === state.deviceId
            ? 'ACTIVE_MY_TURN'
            : 'ACTIVE_WAIT',
        currentStep: {
          stepId: action.payload.stepId,
          actor: action.payload.actor,
          bubbleText: action.payload.bubbleText,
          videoUrl: action.payload.videoUrl,
        },
        choices: action.payload.choices,
        turnDeviceId: action.payload.turnDeviceId,
        error: null,
      }
    case 'SESSION_RESUMED':
      return {
        ...state,
        sessionId: action.payload.sessionId,
        uiState:
          action.payload.turnDeviceId === state.deviceId
            ? 'ACTIVE_MY_TURN'
            : 'ACTIVE_WAIT',
        currentStep: {
          stepId: action.payload.stepId,
          actor: action.payload.actor,
          bubbleText: action.payload.bubbleText,
          videoUrl: action.payload.videoUrl,
        },
        choices: action.payload.choices,
        turnDeviceId: action.payload.turnDeviceId,
        error: null,
      }
    case 'SESSION_MATCH_RESUMED':
      return {
        ...state,
        sessionId: action.sessionId,
        uiState: action.waitingForStart ? 'WAITING_FOR_START' : 'PARTNER_FOUND',
        error: null,
      }
    case 'ROLE_REQUIRED':
      return {
        ...state,
        role: null,
        sessionId: null,
        uiState: 'ROLE_SELECT',
        error: 'Сначала выберите роль.',
        currentStep: null,
        choices: [],
        turnDeviceId: null,
      }
    case 'ERROR':
      return {
        ...state,
        error: action.message,
      }
    default:
      return state
  }
}
