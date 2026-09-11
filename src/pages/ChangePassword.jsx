import { useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'

// Self-service password change, opened from the header (pass onClose).
export default function ChangePassword({ onClose }) {
  const { changePassword } = useApp()
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
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change password</h3>
        <form onSubmit={submit}>
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
            <button type="button" className="ghost" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
            {!done && <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
