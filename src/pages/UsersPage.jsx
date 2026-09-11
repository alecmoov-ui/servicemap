import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/AppContext.jsx'
import { ROLES, CAPABILITIES } from '../lib/roles.js'

// User management (admin + territory manager; the API enforces `manageUsers`).
// Accounts are created here with a permanent username (email) + password.
export default function UsersPage() {
  const { user } = useApp()
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // user | 'new'

  const load = useCallback(async () => {
    try {
      setUsers(await api.getUsers())
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function remove(u) {
    if (!confirm(`Remove ${u.name} (${u.email})? They'll lose access.`)) return
    try {
      await api.deleteUser(u.id)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="stations-page">
      <section className="master">
        <div className="master-head">
          <h3>Users <span className="muted">({users.length})</span></h3>
          <button className="primary" onClick={() => setEditing('new')}>+ Create user</button>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Each user signs in with the email and password you set here. Passwords are stored
          hashed and can't be viewed afterwards — use <b>Edit</b> to set a new one.
        </p>
        {error && <div className="error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email (username)</th><th>Role</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === user.id && <span className="tag added-tag">you</span>}</td>
                  <td>{u.email}</td>
                  <td><span className="badge active">{ROLES[u.role]?.label || u.role}</span></td>
                  <td className="muted">{u.createdAt ? String(u.createdAt).slice(0, 10) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ghost small" onClick={() => setEditing(u)}>Edit</button>{' '}
                    {u.id !== user.id && <button className="ghost small" onClick={() => remove(u)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 24 }}>Permissions by role</h3>
        <div className="table-wrap">
          <table className="table perm-matrix">
            <thead>
              <tr>
                <th>Capability</th>
                {Object.values(ROLES).map((r) => <th key={r.label} style={{ textAlign: 'center' }}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map(([cap, label]) => (
                <tr key={cap}>
                  <td>{label}</td>
                  {Object.keys(ROLES).map((k) => (
                    <td key={k} style={{ textAlign: 'center' }}>
                      {ROLES[k].can[cap] ? <span className="perm-yes">✓</span> : <span className="perm-no">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserForm({ user, onClose, onSaved }) {
  const isNew = !user
  const [f, setF] = useState(user || { name: '', email: '', role: 'sales' })
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (isNew) {
        await api.createUser({ name: f.name, email: f.email, role: f.role, password })
      } else {
        const patch = { name: f.name, role: f.role }
        if (password) patch.password = password
        await api.updateUser(user.id, patch)
      }
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Create user' : 'Edit ' + user.name}</h3>
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Email (username used to sign in)</span>
          <input value={f.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} placeholder="name@moovpool.com" />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={f.role} onChange={(e) => set('role', e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <small className="muted">{ROLES[f.role]?.blurb}</small>
        </label>
        <label className="field">
          <span>{isNew ? 'Password' : 'New password (leave blank to keep current)'}</span>
          <div className="search-row">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
              autoComplete="new-password"
            />
            <button type="button" className="ghost" onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
