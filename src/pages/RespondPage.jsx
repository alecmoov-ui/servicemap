import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api.js'

// Public landing for the accept/decline links in the dispatch email. Posts the
// signed token to the backend, which records the response once (single-use).
export default function RespondPage() {
  const { token } = useParams()
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    api
      .respond(token)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setResult({ error: e.message }))
    return () => {
      cancelled = true
    }
  }, [token])

  const status = result?.status || result?.dispatch?.status

  return (
    <div className="respond">
      <div className="respond-card">
        <div className="login-brand" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <span className="brand-mark">◎</span>
          <div className="brand-name">Moov Service Network</div>
        </div>

        {!result && <p>Recording your response…</p>}
        {result?.error && <p className="error">{result.error}</p>}

        {result && !result.error && (
          <>
            <h2>{status === 'accepted' ? '✅ Job accepted' : '❌ Job declined'}</h2>
            {result.alreadyResponded ? (
              <p className="muted">
                This dispatch was already recorded as <b>{status}</b>. No further action needed.
              </p>
            ) : (
              <p>
                Dispatch <code>{result.dispatch?.id}</code> for <b>{result.dispatch?.stationCompany}</b> has
                been recorded as <b>{status}</b>. Thank you.
              </p>
            )}
            {status === 'accepted' && (
              <p className="muted">
                When the work is finished, reply to the email thread to confirm completion or report
                issues — that updates the job to <b>Completed</b> in our dashboard.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
