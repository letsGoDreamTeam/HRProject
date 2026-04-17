import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { hrLogin, hrLogout, hrMe, hrRegister } from '../api/client'
import { clearHrToken, getHrToken, setHrToken } from '../utils/hrTokenStorage'

const HrAuthContext = createContext(null)

export function HrAuthProvider({ children }) {
  const [token, setToken] = useState(() => getHrToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const tok = getHrToken()
    setToken(tok)
    if (!tok) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const me = await hrMe()
      setUser(me)
    } catch {
      clearHrToken()
      setToken('')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  const login = useCallback(async (email, password) => {
    const data = await hrLogin(email, password)
    setHrToken(data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (email, password, fullName) => {
    const data = await hrRegister(email, password, fullName)
    setHrToken(data.access_token)
    setToken(data.access_token)
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    hrLogout()
    clearHrToken()
    setToken('')
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      register,
      logout,
      refreshMe,
    }),
    [token, user, loading, login, register, logout, refreshMe],
  )

  return <HrAuthContext.Provider value={value}>{children}</HrAuthContext.Provider>
}

export function useHrAuth() {
  const ctx = useContext(HrAuthContext)
  if (!ctx) throw new Error('useHrAuth must be used within HrAuthProvider')
  return ctx
}
