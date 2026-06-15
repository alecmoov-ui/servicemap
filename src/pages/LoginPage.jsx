import { useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'

const DEMO = [
  { role: 'Admin', email: 'admin@moovpool.com' },
  { role: 'DTM', email: 'dtm@moovpool.com' },
  { role: 'Dispatch', email: 'dispatch@moovpool.com' },
]

export default function LoginPage() {
  const { login } = useApp()
  const [email, setEmail] = useState('admin@moovpool.com')
  const [password, setPassword] = useState('moov1234')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">◎</span>
          <div>
            <div className="brand-name">Moov Service Network</div>
            <div className="brand-sub">US Warranty Dispatch &amp; Analytics</div>
          </div>
        </div>

        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>

        <div className="login-demo">
          <span>Demo accounts (password <code>moov1234</code>):</span>
          {DEMO.map((d) => (
            <button type="button" key={d.email} className="chip-mini" onClick={() => setEmail(d.email)}>
              {d.role}
            </button>
          ))}
        </div>
      </form>
    </div>
  )
}
