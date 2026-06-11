import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'

// Admin-only audit log: who did what, when. Filter by action and free-text search.
const ACTIONS = [
  { key: '', label: 'All activity' },
  { key: 'login', label: 'Logins' },
  { key: 'dispatch.create', label: 'Dispatches sent' },
  { key: 'dispatch.advance', label: 'Dispatch updates' },
  { key: 'station.create', label: 'Stations added' },
  { key: 'station.update', label: 'Station edits' },
  { key: 'station.delete', label: 'Stations deleted' },
  { key: 'user.create', label: 'Users invited' },
  { key: 'user.update', label: 'User edits' },
  { key: 'user.delete', label: 'Users removed' },
]

const TAG = {
  login: 'requested',
  'dispatch.create': 'accepted',
  'dispatch.advance': 'completed',
  'station.create': 'active',
  'station.update': 'paused',
  'station.delete': 'issue',
  'user.create': 'active',
  'user.update': 'paused',
  'user.delete': 'issue',
}

export default function ActivityPage() {
  const [rows, setRows] = useState([])
  const [action, setAction] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setRows(await api.getActivity({ action, limit: 500 }))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [action])
  useEffect(() => {
    load()
  }, [load])

  const filtered = rows.filter(
    (r) =>
      !q ||
      [r.actor, r.actorName, r.summary, r.action].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="stations-page">
      <section className="master">
        <div className="master-head">
          <h3>Activity log <span className="muted">({filtered.length})</span></h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
            <button className="ghost" onClick={load}>Refresh</button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at + 'Z').toLocaleString()}</td>
                  <td>
                    <b>{r.actorName || r.actor || '—'}</b>
                    {r.actor && r.actor !== r.actorName && <div className="muted" style={{ fontSize: 11 }}>{r.actor}</div>}
                  </td>
                  <td><span className={'badge ' + (TAG[r.action] || 'requested')}>{r.action}</span></td>
                  <td>{r.summary}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No matching activity.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Times shown in your local timezone. The log records logins, dispatches, station and user changes,
          and station responses to dispatch links.
        </p>
      </section>
    </div>
  )
}
