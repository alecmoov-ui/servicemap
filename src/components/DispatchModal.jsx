import { useState } from 'react'
import { buildDispatchEmail, sendDispatchEmail, SERVICE_MAILBOX } from '../lib/email.js'
import { createDispatch } from '../lib/store.js'

export default function DispatchModal({ station, consumer, product, distanceMi, onClose }) {
  const [issue, setIssue] = useState('')
  const [consumerName, setConsumerName] = useState('')
  const [sent, setSent] = useState(null)

  function send() {
    const dispatch = createDispatch({
      stationId: station.id,
      stationCompany: station.company,
      stationState: station.state,
      product,
      distanceMi,
      issue,
      consumer: { name: consumerName, address: consumer.address, city: consumer.label },
    })
    const email = buildDispatchEmail({
      dispatch,
      station,
      consumer: { name: consumerName, address: consumer.address, city: consumer.label },
      product,
    })
    sendDispatchEmail(email)
    setSent({ dispatch, email })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!sent ? (
          <>
            <h3>Dispatch request → {station.company}</h3>
            <p className="muted">
              {product} · {distanceMi != null ? distanceMi.toFixed(1) + ' mi away' : ''} · sent from{' '}
              <code>{SERVICE_MAILBOX}</code> to <code>{station.email}</code>
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
            <div className="modal-actions">
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={send}>Send dispatch request</button>
            </div>
          </>
        ) : (
          <>
            <h3>✅ Dispatch {sent.dispatch.id} logged</h3>
            <p className="muted">
              Logged at {new Date(sent.dispatch.createdAt).toLocaleString()}. In log-mode the email is
              previewed below (and in the console). Wire a real transport to send it from {SERVICE_MAILBOX}.
            </p>
            <div className="email-preview">
              <div><b>From:</b> {sent.email.from}</div>
              <div><b>To:</b> {sent.email.to}</div>
              <div><b>Subject:</b> {sent.email.subject}</div>
              <pre>{sent.email.body}</pre>
            </div>
            <p className="muted">
              Simulate the station&apos;s response (in production they click the link in the email):
            </p>
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
