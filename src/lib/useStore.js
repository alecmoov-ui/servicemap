import { useEffect, useState } from 'react'
import { getStations, getDispatches, getRole } from './store.js'

// Re-render subscribers whenever the localStorage-backed store changes.
export function useStoreVersion() {
  const [, setV] = useState(0)
  useEffect(() => {
    const bump = () => setV((x) => x + 1)
    window.addEventListener('moov:store', bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener('moov:store', bump)
      window.removeEventListener('storage', bump)
    }
  }, [])
}

export function useStations() {
  useStoreVersion()
  return getStations()
}
export function useDispatches() {
  useStoreVersion()
  return getDispatches()
}
export function useRole() {
  useStoreVersion()
  return getRole()
}
