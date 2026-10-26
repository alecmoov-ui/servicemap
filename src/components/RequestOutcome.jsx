import { useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'
import { can } from '../lib/roles.js'

export const OUTCOME_LABEL = { pending: 'Pending', accepted: 'Accepted', not_needed: 'Accepted · not needed', declined: 'Declined / no answer' }
export const outcomeClass = (o) => (o === 'accepted' ? 'active' : o === 'not_needed' ? 'requested' : o === 'declined' ? 'issue' : 'paused')

// Outcome chips for one dispatch request. Only the exceptions need a click: a station
// that accepted but wasn't used ("not needed") or one that declined / never answered.
// The happy path (accepted + completed) is set automatically when the ticket is logged.
export default function RequestOutcome({ request, stationId, onChanged, compact = false }) {
  const { role, setRequestOutcome } = useApp()
  const [busy, setBusy] = useState(false)
  const set = async (outcome) => {
    setBusy(true)
    try {
      const r = await setRequestOutcome(stationId, request.id, outcome)
      onChanged?.(r)
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const editable = can(role, 'logService')
  if (request.outcome !== 'pending' || !editable) {
    return (
      <span className="req-outcome">
        <span className={'badge ' + outcomeClass(request.outcome)}>{OUTCOME_LABEL[request.outcome] || request.outcome}</span>
        {editable && request.outcome !== 'pending' && !request.serviceEventId && (
          <button className="linkish" disabled={busy} onClick={() => set('pending')} title="Clear this outcome">undo</button>
        )}
      </span>
    )
  }
  return (
    <span className="req-chips">
      {!compact && <span className="muted">Outcome:</span>}
      <button className="chip-mini ok" disabled={busy} onClick={() => set('accepted')} title="They accepted and we sent them (or just log the ticket when done)">Accepted</button>
      <button className="chip-mini" disabled={busy} onClick={() => set('not_needed')} title="They accepted, but another station got the job">Not needed</button>
      <button className="chip-mini bad" disabled={busy} onClick={() => set('declined')} title="Declined or never answered">Declined</button>
    </span>
  )
}
