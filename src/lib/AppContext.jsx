import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api.js'

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [stations, setStations] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setDataLoading(true)
    try {
      const [s, d] = await Promise.all([api.getStations(), api.getDispatches()])
      setStations(s)
      setDispatches(d)
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
    setDispatches([])
  }, [])

  // Mutations refresh from the server so every client stays consistent.
  const createStation = async (s) => {
    await api.createStation(s)
    await loadData()
  }
  const updateStation = async (id, patch) => {
    await api.updateStation(id, patch)
    await loadData()
  }
  const createDispatch = async (d) => {
    const result = await api.createDispatch(d)
    await loadData()
    return result // { dispatch, email, delivery }
  }
  const advanceDispatch = async (id, status, note) => {
    await api.advanceDispatch(id, status, note)
    await loadData()
  }

  const value = {
    user,
    role: user?.role,
    authLoading,
    login,
    logout,
    stations,
    dispatches,
    dataLoading,
    error,
    refresh: loadData,
    createStation,
    updateStation,
    createDispatch,
    advanceDispatch,
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
export const useDispatches = () => useApp().dispatches
export const useRole = () => useApp().role
