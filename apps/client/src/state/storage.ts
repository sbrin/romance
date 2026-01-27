import { z } from 'zod'
import {
  DeviceIdSchema,
  SessionIdSchema,
  SessionStepEventSchema,
  UserRoleSchema,
  type UserRole,
} from '@romance/shared'

const STORAGE_KEYS = {
  DEVICE_ID: 'romance.deviceId',
  ROLE: 'romance.role',
  SESSION: 'romance.session',
} as const

const safeGet = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

const safeRemove = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    return
  }
}

const generateDeviceId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  if (randomUuid) {
    return randomUuid
  }
  return `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export const getOrCreateDeviceId = () => {
  const existing = safeGet(STORAGE_KEYS.DEVICE_ID)
  if (existing) {
    const parsed = DeviceIdSchema.safeParse(existing)
    if (parsed.success) {
      return parsed.data
    }
  }

  const nextId = generateDeviceId()
  safeSet(STORAGE_KEYS.DEVICE_ID, nextId)
  return nextId
}

export const getStoredRole = (): UserRole | null => {
  const stored = safeGet(STORAGE_KEYS.ROLE)
  if (!stored) {
    return null
  }

  const parsed = UserRoleSchema.safeParse(stored)
  if (!parsed.success) {
    safeRemove(STORAGE_KEYS.ROLE)
    return null
  }

  return parsed.data
}

export const persistRole = (role: UserRole) => {
  safeSet(STORAGE_KEYS.ROLE, role)
}

export const clearRole = () => {
  safeRemove(STORAGE_KEYS.ROLE)
}

const StoredSessionSchema = z
  .object({
    sessionId: SessionIdSchema,
    step: SessionStepEventSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.step && value.step.sessionId !== value.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Session step does not match stored session id',
      })
    }
  })

export type StoredSession = z.infer<typeof StoredSessionSchema>

export const getStoredSession = (): StoredSession | null => {
  const stored = safeGet(STORAGE_KEYS.SESSION)
  if (!stored) {
    return null
  }

  const parsedJson = (() => {
    try {
      return JSON.parse(stored) as unknown
    } catch {
      return null
    }
  })()

  if (!parsedJson) {
    safeRemove(STORAGE_KEYS.SESSION)
    return null
  }

  const parsed = StoredSessionSchema.safeParse(parsedJson)
  if (!parsed.success) {
    safeRemove(STORAGE_KEYS.SESSION)
    return null
  }

  return parsed.data
}

export const persistSession = (session: StoredSession) => {
  const parsed = StoredSessionSchema.safeParse(session)
  if (!parsed.success) {
    return
  }
  safeSet(STORAGE_KEYS.SESSION, JSON.stringify(parsed.data))
}

export const clearStoredSession = () => {
  safeRemove(STORAGE_KEYS.SESSION)
}
