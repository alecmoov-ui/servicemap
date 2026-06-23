import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api.js'

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [stations, setStations] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      setStations(await api.getStations())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setDataLoading(false)
    }
  }, [])

  // On boot, validate an existing token and load data.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!getToken()) return setAuthLoading(false)
      try {
        const { user } = await api.me()
        if (cancelled) return
        setUser(user)
        await loadData()
      } catch {
        setToken(null)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [loadData])

  const login = useCallback(
    async (email, password) => {
      const { token, user } = await api.login(email, password)
      setToken(token)
      setUser(user)
      await loadData()
      return user
    },
    [loadData]
  )

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setStations([])
  }, [])

  // If any API call reports the session expired/invalid, return to the login screen.
  useEffect(() => {
    const onUnauthorized = () => logout()
    window.addEventListener('moov:unauthorized', onUnauthorized)
    return () => window.removeEventListener('moov:unauthorized', onUnauthorized)
  }, [logout])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await api.changePassword(currentPassword, newPassword)
    const { user } = await api.me() // reflects cleared mustChangePassword flag
    setUser(user)
  }, [])

  // Mutations refresh from the server so every client stays consistent and new
  // stations / logged events immediately flow into Map, Zone Coverage, Analytics.
  const createStation = async (s) => {
    const created = await api.createStation(s)
    await loadData()
    return created
  }
  const updateStation = async (id, patch) => {
    await api.updateStation(id, patch)
    await loadData()
  }
  const logServiceEvent = async (id, e) => {
    await api.logServiceEvent(id, e)
    await loadData()
  }

  const value = {
    user,
    role: user?.role,
    authLoading,
    login,
    logout,
    changePassword,
    stations,
    dataLoading,
    error,
    refresh: loadData,
    createStation,
    updateStation,
    logServiceEvent,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used within AppProvider')
  return v
}

// Convenience hooks mirroring the old store API so pages need minimal changes.
export const useStations = () => useApp().stations
export const useRole = () => useApp().role
