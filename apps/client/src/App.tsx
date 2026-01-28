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
  SessionAnswerRequestSchema,
  SessionAnswerResponseSchema,
  SessionEndedEventSchema,
  SessionEndRequestSchema,
  SessionEndResponseSchema,
  SESSION_ANSWER_STATUS,
  SessionResumeRequestSchema,
  SessionResumeResponseSchema,
  SESSION_RESUME_STATUS,
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
import { ApiError, API_BASE_URL, postJson, sendBeaconJson } from './api/http'
import { syncRoleSelection } from './api/roleSync'
import { appReducer, createInitialState, type UiState } from './state/appReducer'
import {
  clearStoredSession,
  getOrCreateDeviceId,
  getStoredRole,
  getStoredSession,
  persistRole,
  persistSession,
} from './state/storage'
import RoleSelect from './features/role/RoleSelect'
import QueueStatus from './features/queue/QueueStatus'
import StartSearch from './features/search/StartSearch'
import PartnerFound from './features/search/PartnerFound'
import PartnerCancelled from './features/search/PartnerCancelled'
import SessionStep from './features/session/SessionStep'
import SessionEnded from './features/session/SessionEnded'
import { videoPreloader } from './features/session/videoPreloader'
import ScreenFrame from './ui/ScreenFrame'

const EXIT_AVAILABLE_STATES: UiState[] = [
  'QUEUE',
  'PARTNER_FOUND',
  'WAITING_FOR_START',
  'SESSION_STARTED',
  'ACTIVE_MY_TURN',
  'ACTIVE_WAIT',
]

const CANCEL_ON_EXIT_STATES: UiState[] = [
  'QUEUE',
  'PARTNER_FOUND',
  'WAITING_FOR_START',
]

const RESUME_SESSION_STATES: UiState[] = [
  'SESSION_STARTED',
  'ACTIVE_MY_TURN',
  'ACTIVE_WAIT',
]

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const deviceId = getOrCreateDeviceId()
    const role = getStoredRole()
    const resumeSession = getStoredSession()
    return createInitialState(deviceId, role, resumeSession)
  })
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)
  const roleSyncedRef = useRef(false)
  const latestStateRef = useRef(state)
  const queuedResumeRef = useRef(false)

  useEffect(() => {
    latestStateRef.current = state
  }, [state])

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

    // Запустить предзагрузку если есть список
    if (parsed.data.preloadVideoUrls && parsed.data.preloadVideoUrls.length > 0) {
      videoPreloader.preload(parsed.data.preloadVideoUrls)
    }

    dispatch({ type: 'SESSION_STEP_RECEIVED', payload: parsed.data })
  })

  socket.on(SOCKET_EVENT.SESSION_ENDED, (payload: unknown) => {
    const parsed = SessionEndedEventSchema.safeParse(payload)
    if (!parsed.success) {
      return
    }

    // Очистить кэш предзагруженных видео
    videoPreloader.clear()

    dispatch({
      type: 'SESSION_ENDED',
      sessionId: parsed.data.sessionId,
      reason: parsed.data.reason,
    })
  })

    socket.on('connect_error', () => {
      dispatch({ type: 'ERROR', message: 'Не удалось подключиться к серверу.' })
    })

    return () => {
      socket.disconnect()
    }
  }, [state.deviceId])

  useEffect(() => {
    let cancelled = false

    const resumeSession = async () => {
      try {
        const request = SessionResumeRequestSchema.parse({ deviceId: state.deviceId })
        const response = await postJson(
          '/session/resume',
          request,
          SessionResumeResponseSchema
        )
        if (cancelled) {
          return
        }

        if (response.status === SESSION_RESUME_STATUS.ACTIVE && response.step) {
          dispatch({ type: 'SESSION_RESUMED', payload: response.step })
          return
        }

        if (
          (response.status === SESSION_RESUME_STATUS.FOUND ||
            response.status === SESSION_RESUME_STATUS.WAITING) &&
          response.sessionId
        ) {
          dispatch({
            type: 'SESSION_MATCH_RESUMED',
            sessionId: response.sessionId,
            waitingForStart: response.status === SESSION_RESUME_STATUS.WAITING,
          })
          return
        }

        if (response.status === SESSION_RESUME_STATUS.QUEUED) {
          queuedResumeRef.current = true
          dispatch({ type: 'QUEUE_JOINED' })
          return
        }

        if (response.status === SESSION_RESUME_STATUS.NONE) {
          clearStoredSession()
          const current = latestStateRef.current
          if (RESUME_SESSION_STATES.includes(current.uiState)) {
            dispatch({
              type: 'RETURN_TO_START',
              error: 'Сессия завершена.',
            })
          }
        }
      } catch {
        if (cancelled) {
          return
        }
        const current = latestStateRef.current
        if (RESUME_SESSION_STATES.includes(current.uiState)) {
          dispatch({ type: 'ERROR', message: 'Не удалось восстановить сессию.' })
        }
      }
    }

    void resumeSession()

    return () => {
      cancelled = true
    }
  }, [state.deviceId])

  useEffect(() => {
    const handleExit = () => {
      const current = latestStateRef.current
      if (!CANCEL_ON_EXIT_STATES.includes(current.uiState)) {
        return
      }
      const parsed = QueueCancelRequestSchema.safeParse({ deviceId: current.deviceId })
      if (!parsed.success) {
        return
      }
      clearStoredSession()
      sendBeaconJson('/queue/cancel', parsed.data)
    }

    const handlePageHide = () => {
      handleExit()
    }

    const handleBeforeUnload = () => {
      handleExit()
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (state.uiState !== 'QUEUE') {
      return
    }

    if (queuedResumeRef.current) {
      queuedResumeRef.current = false
      return
    }

    if (!state.role) {
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

  useEffect(() => {
    if (!state.sessionId || !RESUME_SESSION_STATES.includes(state.uiState)) {
      clearStoredSession()
      return
    }

    if (state.uiState === 'SESSION_STARTED') {
      persistSession({ sessionId: state.sessionId })
      return
    }

    if (!state.currentStep || !state.turnDeviceId) {
      persistSession({ sessionId: state.sessionId })
      return
    }

    persistSession({
      sessionId: state.sessionId,
      step: {
        sessionId: state.sessionId,
        stepId: state.currentStep.stepId,
        actor: state.currentStep.actor,
        bubbleText: state.currentStep.bubbleText,
        choices: state.choices,
        videoUrl: state.currentStep.videoUrl,
        turnDeviceId: state.turnDeviceId,
      },
    })
  }, [
    state.sessionId,
    state.uiState,
    state.currentStep,
    state.choices,
    state.turnDeviceId,
  ])

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
    if (EXIT_AVAILABLE_STATES.includes(state.uiState)) {
      const parsed = QueueCancelRequestSchema.safeParse({ deviceId: state.deviceId })
      if (parsed.success) {
        void postJson('/queue/cancel', parsed.data, QueueCancelResponseSchema).catch(() => {
          dispatch({ type: 'ERROR', message: 'Не удалось отменить поиск.' })
        })
      }
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

  const handleChoice = async (choiceId: string) => {
    if (!state.sessionId) {
      dispatch({ type: 'ERROR', message: 'Сессия не найдена.' })
      return
    }

    try {
      const request = SessionAnswerRequestSchema.parse({
        deviceId: state.deviceId,
        sessionId: state.sessionId,
        choiceId,
      })
      const response = await postJson(
        '/session/step/answer',
        request,
        SessionAnswerResponseSchema
      )
      if (response.status === SESSION_ANSWER_STATUS.NOOP) {
        return
      }
    } catch {
      dispatch({ type: 'ERROR', message: 'Не удалось отправить ответ.' })
    }
  }

  const handleReturnToQueue = async () => {
    if (!state.sessionId) {
      dispatch({ type: 'RETURN_TO_QUEUE' })
      return
    }

    try {
      const request = SessionEndRequestSchema.parse({
        deviceId: state.deviceId,
        sessionId: state.sessionId,
      })
      await postJson('/session/end', request, SessionEndResponseSchema)
    } catch {
      dispatch({ type: 'ERROR', message: 'Не удалось завершить сессию.' })
      return
    }

    dispatch({ type: 'RETURN_TO_QUEUE' })
  }

  const baseUrl = API_BASE_URL ? API_BASE_URL.replace(/\/$/, '') : ''
  const videoSrc = state.currentStep?.videoUrl
    ? `${baseUrl}/videos/${state.currentStep.videoUrl}`
    : undefined
  const hasVideo = Boolean(videoSrc)
  const showExitButton = EXIT_AVAILABLE_STATES.includes(state.uiState)

  return (
    <div className="app">
      <div className="video-stage" aria-hidden="true">
        {hasVideo && (
          <video
            key={videoSrc}
            className="video-stage__video"
            autoPlay
            muted
            loop
            playsInline
            src={videoSrc}
          />
        )}
        <div className="video-stage__scrim" />
        <div className="video-stage__grain" />
      </div>

      <ScreenFrame>
        <div className="page-reveal">
          {state.uiState === 'ROLE_SELECT' && (
            <RoleSelect isSubmitting={isSubmittingRole} onSelect={handleSelectRole} />
          )}
          {state.uiState === 'START_SEARCH' && <StartSearch onStart={handleStartSearch} />}
          {state.uiState === 'QUEUE' && <QueueStatus />}
          {state.uiState === 'PARTNER_FOUND' && (
            <PartnerFound status="idle" onStart={handleStartSession} />
          )}
          {state.uiState === 'WAITING_FOR_START' && (
            <PartnerFound status="waiting" onStart={handleStartSession} />
          )}
          {state.uiState === 'SESSION_STARTED' && (
            <PartnerFound status="started" onStart={handleStartSession} />
          )}
          {state.uiState === 'ACTIVE_MY_TURN' && state.currentStep && state.role && (
            <SessionStep
              step={state.currentStep}
              choices={state.choices}
              isMyTurn
              userRole={state.role}
              onChoice={handleChoice}
            />
          )}
          {state.uiState === 'ACTIVE_WAIT' && state.currentStep && state.role && (
            <SessionStep
              step={state.currentStep}
              choices={state.choices}
              isMyTurn={false}
              userRole={state.role}
            />
          )}
          {state.uiState === 'SESSION_ENDED' && (
            <SessionEnded onQueue={handleReturnToQueue} />
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

      {showExitButton && (
        <button className="exit-button" type="button" onClick={handleCancelSearch}>
          Выйти
        </button>
      )}
    </div>
  )
}

export default App
