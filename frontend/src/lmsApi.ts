export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api')

export function getDeviceId(): string {
  let deviceId = localStorage.getItem('tcc_device_id')
  if (!deviceId) {
    deviceId = 'tcc-dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36)
    localStorage.setItem('tcc_device_id', deviceId)
  }
  return deviceId
}

export function getLmsToken(): string | null {
  return localStorage.getItem('lms-token') ?? sessionStorage.getItem('lms-token')
}

export function getLmsUser(): {
  id: number
  name: string
  first_name?: string
  last_name?: string
  email: string
  role: string
  grade?: string
  section?: string
  status?: string
  initials?: string
  lrn?: string
  department?: string
} | null {
  const value = localStorage.getItem('lms-user') ?? sessionStorage.getItem('lms-user')
  if (!value) return null
  try {
    return JSON.parse(value) as {
      id: number
      name: string
      first_name?: string
      last_name?: string
      email: string
      role: string
      grade?: string
      section?: string
      status?: string
      initials?: string
      lrn?: string
      department?: string
    }
  } catch { return null }
}

export class LmsApiError extends Error {
  status: number
  retryAfter?: number

  constructor(message: string, status: number, retryAfter?: number) {
    super(message)
    this.name = 'LmsApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export async function lmsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('X-Device-Id', getDeviceId())
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getLmsToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as {
    message?: string
    errors?: Record<string, string[]>
    retry_after?: number
  }
  if (!response.ok) {
    const validation = payload.errors ? Object.values(payload.errors).flat()[0] : undefined
    throw new LmsApiError(
      validation ?? payload.message ?? `Request failed (${response.status}).`,
      response.status,
      typeof payload.retry_after === 'number' ? payload.retry_after : undefined,
    )
  }
  return payload as T
}

export function extractCollection<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (!payload || typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  if (Array.isArray(obj.data)) return obj.data as T[]
  if (obj.data && typeof obj.data === 'object') {
    const nested = obj.data as Record<string, unknown>
    if (Array.isArray(nested.data)) return nested.data as T[]
  }
  if (Array.isArray(obj.students)) return obj.students as T[]
  if (Array.isArray(obj.quizzes)) return obj.quizzes as T[]
  if (Array.isArray(obj.sections)) return obj.sections as T[]
  if (Array.isArray(obj.subjects)) return obj.subjects as T[]
  if (Array.isArray(obj.users)) return obj.users as T[]
  if (Array.isArray(obj.logs)) return obj.logs as T[]
  if (Array.isArray(obj.announcements)) return obj.announcements as T[]
  if (Array.isArray(obj.notifications)) return obj.notifications as T[]
  return []
}

export function clearStoredSession(): void {
  localStorage.removeItem('lms-token')
  localStorage.removeItem('lms-user')
  sessionStorage.removeItem('lms-token')
  sessionStorage.removeItem('lms-user')
}

export async function signOut(): Promise<void> {
  const token = getLmsToken()
  clearStoredSession()
  if (!token) return
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Device-Id': getDeviceId(),
        Authorization: `Bearer ${token}`,
      },
    })
  } catch { /* Local session already cleared. */ }
}
