// Thin API client. All calls go through `request`, which attaches the JWT and
// surfaces server error messages. The token is kept in localStorage so a refresh
// keeps you signed in. In dev, Vite proxies /api to the backend on :3001.

const TOKEN_KEY = 'moov.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),

  getStations: () => request('/stations'),
  createStation: (s) => request('/stations', { method: 'POST', body: s }),
  updateStation: (id, patch) => request(`/stations/${id}`, { method: 'PUT', body: patch }),
  deleteStation: (id) => request(`/stations/${id}`, { method: 'DELETE' }),

  getDispatches: () => request('/dispatches'),
  createDispatch: (d) => request('/dispatches', { method: 'POST', body: d }),
  advanceDispatch: (id, status, note) => request(`/dispatches/${id}/events`, { method: 'POST', body: { status, note } }),

  geocode: (q) => request('/geocode?q=' + encodeURIComponent(q)),
  respond: (token) => request('/respond', { method: 'POST', body: { token }, auth: false }),
}
