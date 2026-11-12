import { useState, useCallback } from 'react'
import type { User } from '../lib/types'
import { getLmsToken, getLmsUser, signOut, lmsFetch } from '../lib/api'

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => getLmsUser())
  const [token, setToken] = useState<string | null>(() => getLmsToken())
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(getLmsToken() && getLmsUser()))
  const isLoading = false

  const login = useCallback((newUser: User, newToken: string, rememberMe = false) => {
    setUser(newUser)
    setToken(newToken)
    setIsAuthenticated(true)

    localStorage.removeItem('lms-token')
    localStorage.removeItem('lms-user')
    sessionStorage.removeItem('lms-token')
    sessionStorage.removeItem('lms-user')

    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('lms-token', newToken)
    storage.setItem('lms-user', JSON.stringify(newUser))
  }, [])

  const syncUser = useCallback((updatedUser: User) => {
    setUser(updatedUser)
    const storage = localStorage.getItem('lms-token') ? localStorage : sessionStorage
    storage.setItem('lms-user', JSON.stringify(updatedUser))
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setIsAuthenticated(false)
    signOut()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await lmsFetch<{ user: User }>('/me')
      syncUser(data.user)
    } catch {
      logout()
    }
  }, [logout, syncUser])

  return { user, token, isAuthenticated, isLoading, login, syncUser, logout, refresh }
}
