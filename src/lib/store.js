// Client-side data store for the prototype.
//
// The baked-in seed (src/data/stations.seed.json) is the *protected master list*.
// User changes are kept as an OVERLAY in localStorage so they survive reloads but
// can never corrupt or delete the master records. This mirrors how the production
// app should work: the master DB is write-protected and edits go through an API
// with role checks. Resetting localStorage always restores the clean master list.

import seed from '../data/stations.seed.json'

const LS = {
  stationEdits: 'moov.stationEdits.v1', // { [id]: {partial fields} }
  stationsAdded: 'moov.stationsAdded.v1', // [ {full station} ]
  dispatches: 'moov.dispatches.v1', // [ {dispatch record} ]
  role: 'moov.role.v1',
}

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function write(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
  window.dispatchEvent(new Event('moov:store'))
}

// ---- Stations -------------------------------------------------------------

export function getStations() {
  const edits = read(LS.stationEdits, {})
  const added = read(LS.stationsAdded, [])
  const base = seed.map((s) => (edits[s.id] ? { ...s, ...edits[s.id] } : s))
  return [...base, ...added]
}

export function isMasterRecord(id) {
  return seed.some((s) => s.id === id)
}

export function updateStation(id, patch) {
  const added = read(LS.stationsAdded, [])
  const addedIdx = added.findIndex((s) => s.id === id)
  if (addedIdx >= 0) {
    added[addedIdx] = { ...added[addedIdx], ...patch }
    write(LS.stationsAdded, added)
    return
  }
  const edits = read(LS.stationEdits, {})
  edits[id] = { ...(edits[id] || {}), ...patch }
  write(LS.stationEdits, edits)
}

export function addStation(station) {
  const added = read(LS.stationsAdded, [])
  const id = 'st_new_' + Date.now().toString(36)
  added.push({
    id,
    geocodePrecision: 'address',
    status: 'active',
    perf: { dispatchRequests: 0, dispatchAccepted: 0, jobsCompleted: 0 },
    ...station,
  })
  write(LS.stationsAdded, added)
  return id
}

// ---- Dispatches -----------------------------------------------------------

export function getDispatches() {
  return read(LS.dispatches, [])
}

export function createDispatch(record) {
  const list = read(LS.dispatches, [])
  const id = 'dsp_' + Date.now().toString(36)
  const rec = {
    id,
    status: 'requested', // requested | accepted | declined | completed | issue
    createdAt: new Date().toISOString(),
    timeline: [{ at: new Date().toISOString(), event: 'requested' }],
    ...record,
  }
  list.unshift(rec)
  write(LS.dispatches, list)
  return rec
}

export function advanceDispatch(id, status, note) {
  const list = read(LS.dispatches, [])
  const d = list.find((x) => x.id === id)
  if (!d) return
  d.status = status
  d.timeline.push({ at: new Date().toISOString(), event: status, note: note || null })
  write(LS.dispatches, list)
  return d
}

// ---- Role -----------------------------------------------------------------

export function getRole() {
  return read(LS.role, 'admin')
}
export function setRole(role) {
  write(LS.role, role)
}

// ---- Reset ----------------------------------------------------------------

export function resetAll() {
  Object.values(LS).forEach((k) => localStorage.removeItem(k))
  window.dispatchEvent(new Event('moov:store'))
}
