import { useState, useEffect, useCallback } from 'react'
import type { User } from '../lib/types'
import { getLmsToken, getLmsUser, signOut, lmsFetch } from '../lib/api'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = getLmsToken()
    const storedUser = getLmsUser()
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(storedUser)
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const login = (newUser: User, newToken: string, rememberMe = false) => {
    setUser(newUser)
    setToken(newToken)
    setIsAuthenticated(true)

    // Clear both storages first, then set in the correct one
    localStorage.removeItem('lms-token'); localStorage.removeItem('lms-user')
    sessionStorage.removeItem('lms-token'); sessionStorage.removeItem('lms-user')
    const storage = rememberMe ? localStorage : sessionStorage
    storage.setItem('lms-token', newToken)
    storage.setItem('lms-user', JSON.stringify(newUser))
  }

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setIsAuthenticated(false)
    signOut()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await lmsFetch<{ user: User }>('/me')
      setUser(data.user)
      // Persist updated user info
      const storage = localStorage.getItem('lms-token') ? localStorage : sessionStorage
      storage.setItem('lms-user', JSON.stringify(data.user))
    } catch {
      logout()
    }
  }, [logout])

  return { user, token, isAuthenticated, isLoading, login, logout, refresh }
}
