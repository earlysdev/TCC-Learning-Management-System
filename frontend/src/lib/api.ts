/**
 * TCC LMS · API Client
 * Wraps the existing lmsApi.ts patterns with typed helpers.
 * Storage keys use dashes (lms-token, lms-user) to match the existing client.
 */

import type { User } from './types'
import {
  API_BASE,
  LmsApiError,
  clearStoredSession,
  getLmsToken as getTokenFromStore,
  getLmsUser as getRawLmsUser,
  lmsFetch as sharedLmsFetch,
  signOut as sharedSignOut,
} from '../lmsApi'

export { API_BASE }

export function getLmsToken(): string | null {
  return getTokenFromStore()
}

export function getLmsUser(): User | null {
  return getRawLmsUser() as User | null
}

export function setSession(token: string, user: User, remember = false): void {
  clearStoredSession()
  localStorage.setItem('lms-token', token)
  localStorage.setItem('lms-user', JSON.stringify(user))
  if (remember) {
    localStorage.setItem('lms-remember', 'true')
  } else {
    localStorage.removeItem('lms-remember')
  }
}

export async function lmsFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await sharedLmsFetch<T>(path, init)
  } catch (err) {
    if (err instanceof LmsApiError && err.status === 401) {
      // Clear local credentials immediately without re-invoking /logout in a 401 loop.
      clearStoredSession()
    }
    throw err
  }
}

export function signOut(): void {
  void sharedSignOut()
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
