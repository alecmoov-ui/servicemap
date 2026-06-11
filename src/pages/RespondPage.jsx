import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getDispatches, advanceDispatch } from '../lib/store.js'

// Landing page for the accept/decline links embedded in the dispatch email.
// In production this is a signed, single-use token validated by the backend;
// here it flips the dispatch status so the funnel/analytics update.
export default function RespondPage() {
  const { id, action } = useParams()
  const [result, setResult] = useState(null)

  useEffect(() => {
    const d = getDispatches().find((x) => x.id === id)
    if (!d) return setResult({ error: 'Dispatch not found (demo data may have been reset).' })
    if (action === 'accept') {
      advanceDispatch(id, 'accepted')
      setResult({ ok: true, msg: 'accepted', d })
    } else if (action === 'decline') {
      advanceDispatch(id, 'declined')
      setResult({ ok: true, msg: 'declined', d })
    } else {
      setResult({ error: 'Unknown action.' })
    }
  }, [id, action])

  return (
    <div className="respond">
      <div className="respond-card">
        {!result && <p>Recording response…</p>}
        {result?.error && <p className="error">{result.error}</p>}
        {result?.ok && (
          <>
            <h2>{result.msg === 'accepted' ? '✅ Job accepted' : '❌ Job declined'}</h2>
            <p>
              Dispatch <code>{id}</code> for <b>{result.d.stationCompany}</b> has been recorded as{' '}
              <b>{result.msg}</b>. Thank you.
            </p>
            {result.msg === 'accepted' && (
              <p className="muted">
                When the work is finished, reply to the email thread to confirm completion or report
                issues — that updates the job to <b>Completed</b> in the dashboard.
              </p>
            )}
          </>
        )}
        <Link className="primary" to="/stations">
          View dispatch board
        </Link>
      </div>
    </div>
  )
}
