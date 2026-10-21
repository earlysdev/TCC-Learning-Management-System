export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

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
    }
  } catch { return null }
}

export async function lmsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getLmsToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
  if (!response.ok) {
    const validation = payload.errors ? Object.values(payload.errors).flat()[0] : undefined
    throw new Error(validation ?? payload.message ?? `Request failed (${response.status}).`)
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

export async function signOut(): Promise<void> {
  try { await lmsFetch('/logout', { method: 'POST' }) } catch { /* The local session is cleared even if the API is unavailable. */ }
  localStorage.removeItem('lms-token')
  localStorage.removeItem('lms-user')
  sessionStorage.removeItem('lms-token')
  sessionStorage.removeItem('lms-user')
}

