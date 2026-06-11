import { useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'

export default function DispatchModal({ station, consumer, product, distanceMi, onClose }) {
  const { createDispatch, user } = useApp()
  const [issue, setIssue] = useState('')
  const [consumerName, setConsumerName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null) // { dispatch, email, delivery }

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const result = await createDispatch({
        stationId: station.id,
        product,
        distanceMi,
        issue,
        consumer: { name: consumerName, address: consumer.address, city: consumer.label },
      })
      setSent(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!sent ? (
          <>
            <h3>Dispatch request → {station.company}</h3>
            <p className="muted">
              {product} · {distanceMi != null ? distanceMi.toFixed(1) + ' mi away' : ''}
              <br />from <code>{user.email}</code> → <code>{station.email}</code>
            </p>
            <label className="field">
              <span>End-user name (optional)</span>
              <input value={consumerName} onChange={(e) => setConsumerName(e.target.value)} placeholder="Homeowner / account name" />
            </label>
            <label className="field">
              <span>Service location</span>
              <input value={consumer.address} disabled />
            </label>
            <label className="field">
              <span>Issue / RMA detail</span>
              <textarea rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Heat pump throwing E05, no heat. RMA #1234." />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send dispatch request'}</button>
            </div>
          </>
        ) : (
          <>
            <h3>✅ Dispatch {sent.dispatch.id} logged</h3>
            <p className="muted">
              Logged at {new Date(sent.dispatch.createdAt).toLocaleString()}.{' '}
              {sent.delivery?.sent
                ? `Email sent via ${sent.delivery.mode}.`
                : 'Running in log-mode — the composed email is shown below (set EMAIL_TRANSPORT to send it for real).'}
            </p>
            <div className="email-preview">
              <div><b>From:</b> {sent.email.from}</div>
              <div><b>To:</b> {sent.email.to}</div>
              <div><b>Subject:</b> {sent.email.subject}</div>
              <pre>{sent.email.body}</pre>
            </div>
            <p className="muted">Simulate the station&apos;s response (in production they click the link in the email):</p>
            <div className="modal-actions">
              <a className="ghost" href={sent.email.declineUrl}>Open decline link</a>
              <a className="primary" href={sent.email.acceptUrl}>Open accept link</a>
            </div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="ghost" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
