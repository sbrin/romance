import type { UserRole } from '@romance/shared'

export type UiState = 'ROLE_SELECT' | 'QUEUE' | 'PARTNER_FOUND' | 'PARTNER_CANCELLED'

export type AppState = {
  deviceId: string
  role: UserRole | null
  sessionId: string | null
  uiState: UiState
  error: string | null
}

export type AppAction =
  | { type: 'ROLE_SELECTED'; role: UserRole }
  | { type: 'QUEUE_JOINED' }
  | { type: 'QUEUE_CANCELLED' }
  | { type: 'PARTNER_FOUND'; sessionId: string }
  | { type: 'PARTNER_CANCELLED'; sessionId: string }
  | { type: 'ROLE_REQUIRED' }
  | { type: 'ERROR'; message: string }

export const createInitialState = (
  deviceId: string,
  role: UserRole | null
): AppState => {
  return {
    deviceId,
    role,
    sessionId: null,
    uiState: role ? 'QUEUE' : 'ROLE_SELECT',
    error: null,
  }
}

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'ROLE_SELECTED':
      return {
        ...state,
        role: action.role,
        uiState: 'QUEUE',
        error: null,
      }
    case 'QUEUE_JOINED':
      return {
        ...state,
        uiState: 'QUEUE',
        error: null,
      }
    case 'QUEUE_CANCELLED':
      return {
        ...state,
        role: null,
        sessionId: null,
        uiState: 'ROLE_SELECT',
        error: null,
      }
    case 'PARTNER_FOUND':
      if (!state.role || state.uiState !== 'QUEUE') {
        return state
      }
      return {
        ...state,
        sessionId: action.sessionId,
        uiState: 'PARTNER_FOUND',
        error: null,
      }
    case 'PARTNER_CANCELLED':
      if (state.uiState !== 'PARTNER_FOUND' || state.sessionId !== action.sessionId) {
        return state
      }
      return {
        ...state,
        role: null,
        sessionId: null,
        uiState: 'PARTNER_CANCELLED',
        error: null,
      }
    case 'ROLE_REQUIRED':
      return {
        ...state,
        role: null,
        sessionId: null,
        uiState: 'ROLE_SELECT',
        error: 'Сначала выберите роль.',
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
