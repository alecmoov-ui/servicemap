import { useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'

// Reused in two modes:
//   forced  — full-screen, non-dismissable; shown when user.mustChangePassword is set.
//   modal   — self-service, opened from the header (pass onClose).
export default function ChangePassword({ forced = false, onClose }) {
  const { changePassword, logout, user } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (next.length < 8) return setError('New password must be at least 8 characters.')
    if (next !== confirm) return setError('New password and confirmation do not match.')
    setBusy(true)
    try {
      await changePassword(current, next)
      if (forced) return // user.mustChangePassword clears → App swaps to the app
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form onSubmit={submit}>
      {forced && (
        <p className="muted">
          Welcome, {user?.name}. For security, set your own password before continuing.
        </p>
      )}
      <label className="field">
        <span>Current password</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>New password (min 8 characters)</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <div className="error">{error}</div>}
      {done && <div className="muted" style={{ color: 'var(--green)' }}>✓ Password updated.</div>}
      <div className="modal-actions">
        {forced ? (
          <button type="button" className="ghost" onClick={logout}>Sign out</button>
        ) : (
          <button type="button" className="ghost" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
        )}
        {!done && <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>}
      </div>
    </form>
  )

  if (forced) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark">◎</span>
            <div>
              <div className="brand-name">Set your password</div>
              <div className="brand-sub">Moov Service Network</div>
            </div>
          </div>
          {form}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change password</h3>
        {form}
      </div>
    </div>
  )
}
