import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'
import { useApp } from '../lib/AppContext.jsx'
import { ROLES } from '../lib/roles.js'

const APP_URL = window.location.origin
const genPassword = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
const inviteText = (u) =>
  `Hi ${u.name},

You've been given access to the Moov Service Network app.

  Open:           ${APP_URL}
  Your email:     ${u.email}
  Temp password:  ${u.tempPassword}

You'll be asked to set your own password the first time you sign in.`

function Copy({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="ghost small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          alert(text)
        }
      }}
    >
      {done ? '✓ Copied' : label}
    </button>
  )
}

// Admin-only screen (the tab isn't shown to DTM/Dispatch, and the API enforces it).
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
          <h3>Team members <span className="muted">({users.length})</span></h3>
          <button className="primary" onClick={() => setEditing('new')}>+ Invite user</button>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Only admins can see this tab. For security, a user's real password is never stored or shown —
          only the <b>temporary invite password</b> is visible, and only until they sign in and set their own.
        </p>
        {error && <div className="error">{error}</div>}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Temp password</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b>{u.id === user.id && <span className="tag added-tag">you</span>}</td>
                  <td>{u.email}</td>
                  <td><span className="badge active">{ROLES[u.role]?.label || u.role}</span></td>
                  <td>
                    {u.mustChangePassword
                      ? <span className="badge paused">Pending first login</span>
                      : <span className="badge active">Active</span>}
                  </td>
                  <td>
                    {u.mustChangePassword && u.tempPassword ? (
                      <span className="temp-pw">
                        <code>{u.tempPassword}</code>
                        <Copy text={u.tempPassword} label="Copy" />
                        <Copy text={inviteText(u)} label="Copy invite" />
                      </span>
                    ) : (
                      <span className="muted">— set by user</span>
                    )}
                  </td>
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
  const [f, setF] = useState(user || { name: '', email: '', role: 'dispatch' })
  const [password, setPassword] = useState(isNew ? genPassword() : '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // user w/ tempPassword to show after save
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      let result
      if (isNew) {
        result = await api.createUser({ name: f.name, email: f.email, role: f.role, password })
      } else {
        const patch = { name: f.name, role: f.role }
        if (password) patch.password = password
        result = await api.updateUser(user.id, patch)
      }
      if ((isNew || password) && result?.tempPassword) setCreated(result)
      else onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Success panel: show the invite/credentials to copy and share.
  if (created) {
    return (
      <div className="modal-backdrop">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{isNew ? '✅ User invited' : '✅ Password reset'}</h3>
          <p className="muted">Share these with {created.name}. They set their own password on first login.</p>
          <div className="email-preview">
            <div><b>App:</b> {APP_URL}</div>
            <div><b>Email:</b> {created.email}</div>
            <div><b>Temp password:</b> <code>{created.tempPassword}</code></div>
          </div>
          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <Copy text={inviteText(created)} label="Copy invite message" />
            <button className="primary" onClick={onSaved}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Invite team member' : 'Edit ' + user.name}</h3>
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Email {isNew ? '(their work email — used to sign in)' : ''}</span>
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
          <span>{isNew ? 'Temporary password' : 'Reset password (leave blank to keep)'}</span>
          <div className="search-row">
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" />
            <button type="button" className="ghost" onClick={() => setPassword(genPassword())}>Generate</button>
          </div>
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
