import { z } from 'zod'

type ErrorPayload = {
  error?: string
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

const DEFAULT_DEV_BASE_URL = 'http://localhost:3001'
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? DEFAULT_DEV_BASE_URL : '')

const buildUrl = (url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  if (!API_BASE_URL) {
    return url
  }

  const base = API_BASE_URL.replace(/\/$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${base}${path}`
}

const parseErrorCode = (payload: unknown, fallback: string) => {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const errorValue = (payload as ErrorPayload).error
    if (typeof errorValue === 'string' && errorValue.length > 0) {
      return errorValue
    }
  }
  return fallback
}

export const postJson = async <TResponse>(
  url: string,
  body: unknown,
  schema: z.ZodSchema<TResponse>
): Promise<TResponse> => {
  const response = await fetch(buildUrl(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const parsedBody: unknown = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown
        } catch {
          return text
        }
      })()
    : null

  if (!response.ok) {
    const code = parseErrorCode(parsedBody, `HTTP_${response.status}`)
    throw new ApiError(response.status, code)
  }

  const parsed = schema.safeParse(parsedBody)
  if (!parsed.success) {
    throw new Error('INVALID_RESPONSE')
  }

  return parsed.data
}
