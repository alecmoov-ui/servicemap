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

  // Service log (manual performance entry)
  getServiceEvents: (id) => request(`/stations/${id}/service-events`),
  logServiceEvent: (id, e) => request(`/stations/${id}/service-events`, { method: 'POST', body: e }),
  deleteServiceEvent: (id, eventId) => request(`/stations/${id}/service-events/${eventId}`, { method: 'DELETE' }),

  // Documents (multipart)
  getDocuments: (id) => request(`/stations/${id}/documents`),
  async uploadDocument(id, docType, file) {
    const fd = new FormData()
    fd.append('docType', docType)
    fd.append('file', file)
    const headers = {}
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`
    const res = await fetch(`/api/stations/${id}/documents`, { method: 'POST', headers, body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed')
    return res.json()
  },
  deleteDocument: (id, docId) => request(`/stations/${id}/documents/${docId}`, { method: 'DELETE' }),

  // Authenticated file download (carries the JWT, then triggers a browser save).
  async download(path, filename) {
    const headers = {}
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`
    const res = await fetch('/api' + path, { headers })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },

  // Data protection
  getSnapshots: () => request('/admin/snapshots'),
  createSnapshot: () => request('/admin/snapshot', { method: 'POST' }),

  geocode: (q) => request('/geocode?q=' + encodeURIComponent(q)),

  getUsers: () => request('/users'),
  createUser: (u) => request('/users', { method: 'POST', body: u }),
  updateUser: (id, patch) => request(`/users/${id}`, { method: 'PUT', body: patch }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getActivity: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
    return request('/activity' + (q ? '?' + q : ''))
  },
}
