import { useState, useEffect, useCallback } from 'react'

const TOKEN_KEY = 'lab_auth_token'

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  const verify = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setIsAuthenticated(false)
      setIsChecking(false)
      return
    }
    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${stored}` },
      })
      if (res.ok) {
        setToken(stored)
        setIsAuthenticated(true)
      } else {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setIsAuthenticated(false)
      }
    } catch {
      setIsAuthenticated(!!stored)
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => { verify() }, [verify])

  const login = (newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setIsAuthenticated(true)
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setIsAuthenticated(false)
  }

  return { token, isAuthenticated, isChecking, login, logout }
}
