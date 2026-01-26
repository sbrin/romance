import { useEffect, useReducer, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  PartnerCancelledEventSchema,
  PartnerFoundEventSchema,
  QueueCancelRequestSchema,
  QueueCancelResponseSchema,
  QueueJoinRequestSchema,
  QueueJoinResponseSchema,
  QUEUE_JOIN_STATUS,
  RoleSelectRequestSchema,
  RoleSelectResponseSchema,
  SOCKET_EVENT,
  SocketAuthSchema,
  type QueueJoinResponse,
  type UserRole,
} from '@romance/shared'
import './App.css'
import { ApiError, API_BASE_URL, postJson } from './api/http'
import { appReducer, createInitialState } from './state/appReducer'
import { getOrCreateDeviceId, getStoredRole, persistRole } from './state/storage'
import RoleSelect from './features/role/RoleSelect'
import QueueStatus from './features/queue/QueueStatus'
import StartSearch from './features/search/StartSearch'
import PartnerFound from './features/search/PartnerFound'
import PartnerCancelled from './features/search/PartnerCancelled'
import ScreenFrame from './ui/ScreenFrame'

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => {
    const deviceId = getOrCreateDeviceId()
    const role = getStoredRole()
    return createInitialState(deviceId, role)
  })
  const [isSubmittingRole, setIsSubmittingRole] = useState(false)

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

    const syncRole = async () => {
      try {
        const request = RoleSelectRequestSchema.parse({
          deviceId: state.deviceId,
          role: state.role,
        })
        await postJson('/role', request, RoleSelectResponseSchema)
        return true
      } catch {
        return false
      }
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
      const request = RoleSelectRequestSchema.parse({ deviceId: state.deviceId, role })
      await postJson('/role', request, RoleSelectResponseSchema)
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

  return (
    <div className="app">
      <div className="video-stage" aria-hidden="true">
        <video className="video-stage__video" autoPlay muted loop playsInline />
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
          {state.uiState === 'PARTNER_FOUND' && <PartnerFound onCancel={handleCancelSearch} />}
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
