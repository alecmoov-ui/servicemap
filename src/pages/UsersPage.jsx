import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/AppContext.jsx'
import { ROLES } from '../lib/roles.js'

// Admin-only screen to invite/manage team members (TMs, dispatchers).
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
    if (!confirm(`Remove ${u.name} (${u.email})?`)) return
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
          <h3>Team members <span className="muted">({users.length})</span></h3>
          <button className="primary" onClick={() => setEditing('new')}>+ Invite user</button>
        </div>
        {error && <div className="error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === user.id && <span className="tag added-tag">you</span>}</td>
                  <td>{u.email}</td>
                  <td><span className="badge active">{ROLES[u.role]?.label || u.role}</span></td>
                  <td className="muted">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="ghost small" onClick={() => setEditing(u)}>Edit</button>{' '}
                    {u.id !== user.id && <button className="ghost small" onClick={() => remove(u)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Roles: {Object.values(ROLES).map((r) => `${r.label} — ${r.blurb}`).join('  ·  ')}
        </p>
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
  const [f, setF] = useState(user || { name: '', email: '', role: 'dispatch', password: '' })
  const [password, setPassword] = useState('')
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Invite team member' : 'Edit ' + user.name}</h3>
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input value={f.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={f.role} onChange={(e) => set('role', e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{isNew ? 'Temporary password' : 'New password (leave blank to keep)'}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : isNew ? 'Invite' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
