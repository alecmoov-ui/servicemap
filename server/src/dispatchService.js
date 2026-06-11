// Shared dispatch status transitions, used by both the authenticated dispatch
// routes and the public accept/decline token endpoint. Keeps station performance
// counters in sync and prevents double-counting.

import { db, rowToDispatch } from './db.js'

const VALID = ['requested', 'accepted', 'declined', 'completed', 'issue']

export function getDispatch(id) {
  const row = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id)
  if (!row) return null
  const events = db.prepare('SELECT * FROM dispatch_events WHERE dispatch_id = ? ORDER BY id').all(id)
  return rowToDispatch(row, events)
}

export function listDispatches() {
  const rows = db.prepare('SELECT * FROM dispatches ORDER BY created_at DESC').all()
  const evStmt = db.prepare('SELECT * FROM dispatch_events WHERE dispatch_id = ? ORDER BY id')
  return rows.map((r) => rowToDispatch(r, evStmt.all(r.id)))
}

// Advance a dispatch to a new status, recording an event and updating the
// station's lifetime counters. Counter bumps happen only on the first transition
// into accepted/completed so re-clicks don't inflate the numbers.
export const advance = db.transaction((id, status, note, actor) => {
  if (!VALID.includes(status)) throw new Error('Invalid status: ' + status)
  const row = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(id)
  if (!row) return null

  const wasAccepted = ['accepted', 'completed'].includes(row.status)
  const wasCompleted = row.status === 'completed'

  db.prepare('UPDATE dispatches SET status = ? WHERE id = ?').run(status, id)
  db.prepare('INSERT INTO dispatch_events (dispatch_id, event, note, actor) VALUES (?, ?, ?, ?)')
    .run(id, status, note || null, actor || null)

  if ((status === 'accepted' || status === 'completed') && !wasAccepted) {
    db.prepare('UPDATE stations SET dispatch_accepted = dispatch_accepted + 1 WHERE id = ?').run(row.station_id)
  }
  if (status === 'completed' && !wasCompleted) {
    db.prepare('UPDATE stations SET jobs_completed = jobs_completed + 1 WHERE id = ?').run(row.station_id)
  }
  return getDispatch(id)
})
