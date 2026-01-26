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
  type UserRole,
} from '@romance/shared'
import './App.css'
import { ApiError, API_BASE_URL, postJson } from './api/http'
import { appReducer, createInitialState } from './state/appReducer'
import { clearRole, getOrCreateDeviceId, getStoredRole, persistRole } from './state/storage'
import RoleSelect from './features/role/RoleSelect'
import QueueStatus from './features/queue/QueueStatus'
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
    if (state.uiState === 'PARTNER_CANCELLED') {
      clearRole()
    }
  }, [state.uiState])

  useEffect(() => {
    if (!state.role) {
      return
    }

    let cancelled = false

    const joinQueue = async () => {
      try {
        const request = QueueJoinRequestSchema.parse({ deviceId: state.deviceId })
        const response = await postJson('/queue/join', request, QueueJoinResponseSchema)
        if (cancelled) {
          return
        }

        if (response.status === QUEUE_JOIN_STATUS.PARTNER_FOUND && response.sessionId) {
          dispatch({ type: 'PARTNER_FOUND', sessionId: response.sessionId })
          return
        }

        dispatch({ type: 'QUEUE_JOINED' })
      } catch (error) {
        if (cancelled) {
          return
        }

        if (error instanceof ApiError && error.code === 'ROLE_REQUIRED') {
          clearRole()
          dispatch({ type: 'ROLE_REQUIRED' })
          return
        }

        dispatch({ type: 'ERROR', message: 'Не удалось встать в очередь.' })
      }
    }

    joinQueue()

    return () => {
      cancelled = true
    }
  }, [state.deviceId, state.role])

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
    clearRole()
    dispatch({ type: 'QUEUE_CANCELLED' })
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
          {state.uiState === 'QUEUE' && <QueueStatus onCancel={handleCancelSearch} />}
          {state.uiState === 'PARTNER_FOUND' && <PartnerFound onCancel={handleCancelSearch} />}
          {state.uiState === 'PARTNER_CANCELLED' && (
            <PartnerCancelled onRestart={handleCancelSearch} />
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
