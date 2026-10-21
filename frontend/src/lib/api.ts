/**
 * LNHS LMS — API Client
 * Wraps the existing lmsApi.ts patterns with typed helpers.
 * Storage keys use dashes (lms-token, lms-user) to match the existing client.
 */

import type { User } from './types'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

/* ── Token / User helpers ────────────────────────────────────────── */

export function getLmsToken(): string | null {
  return localStorage.getItem('lms-token') ?? sessionStorage.getItem('lms-token')
}

export function getLmsUser(): User | null {
  const raw = localStorage.getItem('lms-user') ?? sessionStorage.getItem('lms-user')
  if (!raw) return null
  try { return JSON.parse(raw) as User } catch { return null }
}

export function setSession(token: string, user: User, remember = false): void {
  const storage = remember ? localStorage : sessionStorage
  // Clear both first
  localStorage.removeItem('lms-token'); localStorage.removeItem('lms-user')
  sessionStorage.removeItem('lms-token'); sessionStorage.removeItem('lms-user')
  storage.setItem('lms-token', token)
  storage.setItem('lms-user', JSON.stringify(user))
}

/* ── Fetch wrapper ───────────────────────────────────────────────── */

export async function lmsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getLmsToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const payload = await response.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }

  if (!response.ok) {
    if (response.status === 401) signOut()
    const validation = payload.errors ? Object.values(payload.errors).flat()[0] : undefined
    throw new Error(validation ?? payload.message ?? `Request failed (${response.status}).`)
  }
  return payload as T
}

/* ── Sign out ────────────────────────────────────────────────────── */

export function signOut(): void {
  try { void lmsFetch('/logout', { method: 'POST' }) } catch { /* local session cleared anyway */ }
  localStorage.removeItem('lms-token')
  localStorage.removeItem('lms-user')
  sessionStorage.removeItem('lms-token')
  sessionStorage.removeItem('lms-user')
}

/* ── Helpers ─────────────────────────────────────────────────────── */

export function buildPaginationParams(page: number, perPage = 15, filters?: Record<string, string>): string {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, v)
    }
  }
  return params.toString()
}
