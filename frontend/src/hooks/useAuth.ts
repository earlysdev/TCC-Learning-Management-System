import { useState, useCallback, useEffect } from 'react'
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

    // Store in localStorage so all browser tabs and windows stay synchronized
    localStorage.setItem('lms-token', newToken)
    localStorage.setItem('lms-user', JSON.stringify(newUser))
    sessionStorage.removeItem('lms-token')
    sessionStorage.removeItem('lms-user')

    if (rememberMe) {
      localStorage.setItem('lms-remember', 'true')
    } else {
      localStorage.removeItem('lms-remember')
    }
  }, [])

  const syncUser = useCallback((updatedUser: User) => {
    setUser(updatedUser)
    localStorage.setItem('lms-user', JSON.stringify(updatedUser))
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setIsAuthenticated(false)
    localStorage.removeItem('lms-token')
    localStorage.removeItem('lms-user')
    localStorage.removeItem('lms-remember')
    sessionStorage.removeItem('lms-token')
    sessionStorage.removeItem('lms-user')
    signOut()
  }, [])

  // Synchronize authentication state across tabs in real-time
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'lms-token' || e.key === 'lms-user') {
        const currentToken = getLmsToken()
        const currentUser = getLmsUser()
        setToken(currentToken)
        setUser(currentUser)
        setIsAuthenticated(Boolean(currentToken && currentUser))
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
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
