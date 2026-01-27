import { useEffect, useReducer, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  PartnerCancelledEventSchema,
  PartnerFoundEventSchema,
  QueueCancelRequestSchema,
  QueueCancelResponseSchema,
  QueueJoinRequestSchema,
  QueueJoinResponseSchema,
  QUEUE_JOIN_STATUS,
  SessionStepEventSchema,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SessionStartedEventSchema,
  SESSION_START_STATUS,
  SOCKET_EVENT,
  SocketAuthSchema,
  type QueueJoinResponse,
  type UserRole,
} from '@romance/shared'
import './App.css'
import { ApiError, API_BASE_URL, postJson } from './api/http'
import { syncRoleSelection } from './api/roleSync'
import { appReducer, createInitialState } from './state/appReducer'
import { getOrCreateDeviceId, getStoredRole, persistRole } from './state/storage'
import RoleSelect from './features/role/RoleSelect'
import QueueStatus from './features/queue/QueueStatus'
import StartSearch from './features/search/StartSearch'
import PartnerFound from './features/search/PartnerFound'
import PartnerCancelled from './features/search/PartnerCancelled'
import SessionStep from './features/session/SessionStep'
import ScreenFrame from './ui/ScreenFrame'

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const deviceId = getOrCreateDeviceId()
    const role = getStoredRole()
    return createInitialState(deviceId, role)
  })
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)
  const roleSyncedRef = useRef(false)

  useEffect(() => {
    if (!state.role) {
      roleSyncedRef.current = false
    }
  }, [state.role])

  useEffect(() => {
    const authParsed = SocketAuthSchema.safeParse({ deviceId: state.deviceId })
    if (!authParsed.success) {
      dispatch({ type: 'ERROR', message: 'Некорректный идентификатор устройства.' })
      return
    }

    const socket: Socket = io(API_BASE_URL || undefined, { auth: authParsed.data })

    socket.on(SOCKET_EVENT.PARTNER_FOUND, (payload: unknown) => {
      const parsed = PartnerFoundEventSchema.safeParse(payload)
      if (!parsed.success) {
        return
      }
      dispatch({ type: 'PARTNER_FOUND', sessionId: parsed.data.sessionId })
    })

    socket.on(SOCKET_EVENT.PARTNER_CANCELLED, (payload: unknown) => {
      const parsed = PartnerCancelledEventSchema.safeParse(payload)
      if (!parsed.success) {
        return
      }
      dispatch({ type: 'PARTNER_CANCELLED', sessionId: parsed.data.sessionId })
    })

    socket.on(SOCKET_EVENT.SESSION_STARTED, (payload: unknown) => {
      const parsed = SessionStartedEventSchema.safeParse(payload)
      if (!parsed.success) {
        return
      }
      dispatch({ type: 'SESSION_STARTED', sessionId: parsed.data.sessionId })
    })

    socket.on(SOCKET_EVENT.SESSION_STEP, (payload: unknown) => {
      const parsed = SessionStepEventSchema.safeParse(payload)
      if (!parsed.success) {
        return
      }
      dispatch({ type: 'SESSION_STEP_RECEIVED', payload: parsed.data })
    })

    socket.on('connect_error', () => {
      dispatch({ type: 'ERROR', message: 'Не удалось подключиться к серверу.' })
    })

    return () => {
      socket.disconnect()
    }
  }, [state.deviceId])

  useEffect(() => {
    if (state.uiState !== 'QUEUE' || !state.role) {
      return
    }

    let cancelled = false
    const role = state.role

    const syncRole = async () => {
      const synced = await syncRoleSelection(state.deviceId, role)
      if (synced) {
        roleSyncedRef.current = true
      }
      return synced
    }

    const ensureRoleSynced = async () => {
      if (roleSyncedRef.current) {
        return true
      }
      return syncRole()
    }

    const attemptJoinQueue = async () => {
      const request = QueueJoinRequestSchema.parse({ deviceId: state.deviceId })
      return postJson('/queue/join', request, QueueJoinResponseSchema)
    }

    const handleQueueResponse = (response: QueueJoinResponse) => {
      if (response.status === QUEUE_JOIN_STATUS.PARTNER_FOUND && response.sessionId) {
        dispatch({ type: 'PARTNER_FOUND', sessionId: response.sessionId })
        return
      }

      dispatch({ type: 'QUEUE_JOINED' })
    }

    const joinQueue = async () => {
      try {
        const synced = await ensureRoleSynced()
        if (cancelled) {
          return
        }
        if (!synced) {
          dispatch({
            type: 'RETURN_TO_START',
            error: 'Не удалось подтвердить роль. Попробуйте еще раз.',
          })
          return
        }

        const response = await attemptJoinQueue()
        if (cancelled) {
          return
        }

        handleQueueResponse(response)
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof ApiError && error.code === 'ROLE_REQUIRED') {
          roleSyncedRef.current = false
          const synced = await syncRole()
          if (cancelled) {
            return
          }
          if (!synced) {
            dispatch({
              type: 'RETURN_TO_START',
              error: 'Не удалось подтвердить роль. Попробуйте еще раз.',
            })
            return
          }

          try {
            const response = await attemptJoinQueue()
            if (cancelled) {
              return
            }
            handleQueueResponse(response)
          } catch (retryError) {
            if (cancelled) {
              return
            }
            if (retryError instanceof ApiError && retryError.code === 'ROLE_REQUIRED') {
              dispatch({
                type: 'RETURN_TO_START',
                error: 'Не удалось подтвердить роль. Попробуйте еще раз.',
              })
              return
            }
            dispatch({
              type: 'RETURN_TO_START',
              error: 'Не удалось встать в очередь.',
            })
          }
          return
        }

        dispatch({ type: 'RETURN_TO_START', error: 'Не удалось встать в очередь.' })
      }
    }

    joinQueue()

    return () => {
      cancelled = true
    }
  }, [state.deviceId, state.role, state.uiState])

  const handleSelectRole = async (role: UserRole) => {
    setIsSubmittingRole(true)
    try {
      const synced = await syncRoleSelection(state.deviceId, role)
      if (!synced) {
        throw new Error('ROLE_SYNC_FAILED')
      }
      roleSyncedRef.current = true
      persistRole(role)
      dispatch({ type: 'ROLE_SELECTED', role })
    } catch {
      dispatch({ type: 'ERROR', message: 'Не удалось сохранить роль.' })
    } finally {
      setIsSubmittingRole(false)
    }
  }

  const handleCancelSearch = () => {
    const parsed = QueueCancelRequestSchema.safeParse({ deviceId: state.deviceId })
    if (parsed.success) {
      void postJson('/queue/cancel', parsed.data, QueueCancelResponseSchema).catch(() => {
        dispatch({ type: 'ERROR', message: 'Не удалось отменить поиск.' })
      })
    }
    dispatch({ type: 'RETURN_TO_START' })
  }

  const handleStartSearch = () => {
    dispatch({ type: 'START_SEARCH' })
  }

  const handleStartSession = async () => {
    if (!state.sessionId) {
      dispatch({ type: 'ERROR', message: 'Сессия не найдена.' })
      return
    }

    dispatch({ type: 'START_PRESSED' })

    try {
      const request = SessionStartRequestSchema.parse({
        deviceId: state.deviceId,
        sessionId: state.sessionId,
      })
      const response = await postJson(
        '/session/start',
        request,
        SessionStartResponseSchema
      )
      if (response.status === SESSION_START_STATUS.STARTED) {
        dispatch({ type: 'SESSION_STARTED', sessionId: state.sessionId })
      }
    } catch {
      dispatch({ type: 'START_FAILED', message: 'Не удалось подтвердить старт.' })
    }
  }

  const baseUrl = API_BASE_URL ? API_BASE_URL.replace(/\/$/, '') : ''
  const videoSrc = state.currentStep?.videoUrl
    ? `${baseUrl}/videos/${state.currentStep.videoUrl}`
    : undefined

  return (
    <div className="app">
      <div className="video-stage" aria-hidden="true">
        <video
          className="video-stage__video"
          autoPlay
          muted
          loop
          playsInline
          src={videoSrc}
        />
        <div className="video-stage__scrim" />
        <div className="video-stage__grain" />
      </div>

      <ScreenFrame>
        <div className="page-reveal">
          {state.uiState === 'ROLE_SELECT' && (
            <RoleSelect isSubmitting={isSubmittingRole} onSelect={handleSelectRole} />
          )}
          {state.uiState === 'START_SEARCH' && <StartSearch onStart={handleStartSearch} />}
          {state.uiState === 'QUEUE' && <QueueStatus onCancel={handleCancelSearch} />}
          {state.uiState === 'PARTNER_FOUND' && (
            <PartnerFound
              status="idle"
              onCancel={handleCancelSearch}
              onStart={handleStartSession}
            />
          )}
          {state.uiState === 'WAITING_FOR_START' && (
            <PartnerFound
              status="waiting"
              onCancel={handleCancelSearch}
              onStart={handleStartSession}
            />
          )}
          {state.uiState === 'SESSION_STARTED' && (
            <PartnerFound
              status="started"
              onCancel={handleCancelSearch}
              onStart={handleStartSession}
            />
          )}
          {state.uiState === 'ACTIVE_MY_TURN' && state.currentStep && (
            <SessionStep
              step={state.currentStep}
              choices={state.choices}
              isMyTurn
            />
          )}
          {state.uiState === 'ACTIVE_WAIT' && state.currentStep && (
            <SessionStep
              step={state.currentStep}
              choices={state.choices}
              isMyTurn={false}
            />
          )}
          {state.uiState === 'PARTNER_CANCELLED' && (
            <PartnerCancelled onStart={handleStartSearch} />
          )}
        </div>

        {state.error && (
          <div className="error-toast" role="status">
            {state.error}
          </div>
        )}
      </ScreenFrame>
    </div>
  )
}

export default App
