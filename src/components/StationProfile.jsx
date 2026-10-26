import { useEffect, useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'
import { api } from '../lib/api.js'
import { can } from '../lib/roles.js'
import { PRODUCTS, reliabilityScore, acceptanceRate, completionRate, flagRate, oneTripRate, avgJobValue, productLabel, pct } from '../lib/ratings.js'
import { complianceLabel, complianceClass, issueText } from '../lib/compliance.js'
import { stationPins, pinLabel } from '../lib/geo.js'
import { fmtRadius, region as regionInfo, fmtMoney } from '../lib/units.js'
import RequestOutcome from './RequestOutcome.jsx'
import LocatePreview from './LocatePreview.jsx'
import CopyCard from './CopyCard.jsx'
import { formatAddress } from '../lib/format.js'

const DOC_LABELS = { contract: 'Service Contract', schedule_a: 'Schedule A (Profile)', hvac_license: 'HVAC License', insurance: 'Proof of Insurance' }
const yn = (v) => (v ? 'Yes' : 'No')
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

// Label column + value column (grid, see .profile .row): every row lines up the same
// way whether the value is a number or a three-line address.
function Row({ label, value }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="row"><span className="row-label">{label}</span><span className={empty ? 'row-value none' : 'row-value'}>{dash(value)}</span></div>
  )
}

// Read-only full profile for one station: everything the form holds, plus documents
// and recent service log. Reachable from the Map, Zone Coverage and the Stations list,
// so view-only roles can see complete details. `onEdit` (optional) shows an Edit button.
export default function StationProfile({ station: s, onClose, onEdit }) {
  const { role } = useApp()
  const [docs, setDocs] = useState([])
  const [events, setEvents] = useState([])
  const [requests, setRequests] = useState([])
  const loadRequests = () => api.getRequests(s.id).then(setRequests).catch(() => {})
  useEffect(() => {
    api.getDocuments(s.id).then(setDocs).catch(() => {})
    api.getServiceEvents(s.id).then(setEvents).catch(() => {})
    loadRequests()
  }, [s.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const flags = events.filter((e) => e.flagged)
  const info = regionInfo(s.country)
  const acc = acceptanceRate(s.perf)
  const comp = completionRate(s.perf)
  const pins = stationPins(s)

  return (
    <div className="modal-backdrop">
      <div className="modal wide profile" onClick={(e) => e.stopPropagation()}>
        <div className="profile-head">
          <div>
            <h3>{s.company} <CopyCard station={s} label /></h3>
            <div className="profile-meta">
              <span>{formatAddress(s.serviceAddress, s.city, s.state, s.zip)}</span>
              <span className="tag">{info.label}</span>
              <span className={'badge ' + s.status}>{s.status}</span>
              {s.compliance && s.compliance.level !== 'ok' && (
                <span className={'badge ' + complianceClass(s.compliance.level)} title={issueText(s.compliance)}>{complianceLabel(s.compliance.level)}</span>
              )}
            </div>
          </div>
          <div className="score big" title="Reliability score">{reliabilityScore(s.perf)}</div>
        </div>

        <div className="profile-grid">
          <section>
            <div className="label-row">Contact</div>
            <Row label="Primary contact" value={[s.primaryContact, s.primaryContactTitle && `(${s.primaryContactTitle})`].filter(Boolean).join(' ')} />
            <Row label="Phone" value={s.phone} />
            <Row label="Email" value={s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : null} />
            <Row label="Preferred contact" value={s.preferredContact} />
            <Row label="After hours" value={yn(s.afterHours)} />
            {(s.contacts || []).map((c, i) => (
              <Row key={i} label={c.title || 'Contact'}
                value={<>{c.name || '—'}{(c.phone || c.email) && <><br /><span className="row-sub">{[c.phone, c.email].filter(Boolean).join(' · ')}</span></>}</>} />
            ))}

            <div className="label-row">Addresses</div>
            <Row label="Service" value={formatAddress(s.serviceAddress, s.city, s.state, s.zip)} />
            <Row label="Billing" value={formatAddress(s.billingAddress)} />
            <Row label="Shipping" value={formatAddress(s.shippingAddress)} />

            <div className="label-row">Business</div>
            <Row label="Tax ID / EIN" value={s.taxId} />
            <Row label="Service type" value={s.serviceType} />
            <Row label="Technicians" value={s.totalTechnicians} />
            <Row label="Holds Moov inventory" value={s.holdsInventory} />
            {s.holdsInventory === 'Yes' && <Row label="Parts held" value={(s.partsCategories || []).map(productLabel).join(', ')} />}
            <Row label="W-9 on file" value={yn(s.w9OnFile)} />
          </section>

          <section>
            <div className="label-row">Coverage</div>
            <LocatePreview lat={s.lat} lng={s.lng} radiusMi={s.serviceRadiusMi} polygon={s.coveragePolygon} areas={s.serviceAreas || []} />
            {pins.length === 0 && <div className="error">No map pin — this station does not appear on the map until it is located.</div>}
            {pins.map((p) => (
              <Row key={p.key} label={p.primary ? 'Primary' : pinLabel(p)} value={p.polygon ? `Drawn outline (${p.polygon.length} points)` : `${fmtRadius(p.radiusMi, s.country)} radius`} />
            ))}

            <div className="label-row">Products qualified</div>
            <div className="prodcell">
              {PRODUCTS.filter((p) => s.products?.[p.key]).map((p) => <span key={p.key} className="ptag">{p.label}</span>)}
              {PRODUCTS.every((p) => !s.products?.[p.key]) && <span className="muted">None recorded</span>}
            </div>

            <div className="label-row">Licensing & insurance</div>
            <Row label="HVAC license" value={s.hvacLicense} />
            <Row label="HVAC certification" value={s.hvacCertification} />
            <Row label="EPA 608 techs / level" value={[s.epa608Techs, s.epa608Level].filter((v) => v !== null && v !== undefined && v !== '').join(' · ')} />
            <Row label="Insurance carrier" value={s.insuranceCarrier} />
            <Row label="GL limits" value={s.glLimits} />
            <Row label="Insurance expiry" value={s.insuranceExpiry} />
            <Row label="Proof of insurance" value={s.proofOfInsurance} />
            <Row label="Contract on file" value={yn(s.contractOnFile)} />
            <Row label="Agreement effective" value={s.effectiveDate} />
            <Row label="Contract expiry" value={s.contractExpiry} />

            <div className="label-row">Documents</div>
            {docs.length === 0 && <div className="muted">No documents uploaded.</div>}
            {docs.map((d) => (
              <Row key={d.id} label={DOC_LABELS[d.docType] || d.docType}
                value={<button className="linkish" onClick={() => api.download(`/stations/${s.id}/documents/${d.id}/download`, d.originalName)}>⬇ {d.originalName}</button>} />
            ))}
          </section>
        </div>

        <div className="label-row">Performance <span className="muted">(derived from dispatch requests + the service log)</span></div>
        <div className="perf-grid">
          <div className="perf-cell"><b>{s.perf?.dispatchRequests ?? 0}</b><span>Requests</span></div>
          <div className="perf-cell"><b>{pct(acc)}</b><span>Acceptance</span></div>
          <div className="perf-cell"><b>{s.perf?.jobsCompleted ?? 0}</b><span>Completed</span></div>
          <div className="perf-cell"><b>{pct(comp)}</b><span>Completion</span></div>
          <div className="perf-cell"><b>{fmtMoney(s.perf?.totalValue, s.country)}</b><span>Job value</span></div>
          <div className="perf-cell"><b>{fmtMoney(avgJobValue(s.perf), s.country)}</b><span>Avg per job</span></div>
          <div className="perf-cell"><b>{s.perf?.flags ?? 0} <small>({pct(flagRate(s.perf))})</small></b><span>Flags</span></div>
          <div className="perf-cell"><b>{s.perf?.oneTrip ?? 0} <small>({pct(oneTripRate(s.perf))})</small></b><span>One trip</span></div>
        </div>

        <div className="label-row">Flags <span className="muted">({flags.length})</span></div>
        {flags.length === 0 && <div className="muted">No flagged tickets.</div>}
        {flags.map((e) => (
          <div key={e.id} className="flag-note">
            <b>{e.eventDate}</b>{e.zendeskTicket ? ` · Zendesk ${e.zendeskTicket}` : ''}{e.product ? ` · ${e.product}` : ''} — {e.flagNote}
          </div>
        ))}

        <div className="label-row">Dispatch requests <span className="muted">({requests.length})</span></div>
        {requests.length === 0 && <div className="muted">No dispatch requests yet — use <b>Request dispatch</b> on a Map result card.</div>}
        {requests.length > 0 && (
          <div className="table-wrap">
            <table className="table small">
              <thead><tr><th>Requested</th><th>Product</th><th>Service address</th><th>Ticket</th><th>Outcome</th></tr></thead>
              <tbody>
                {requests.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.requestedAt + 'Z').toLocaleDateString()}</td>
                    <td>{r.product || '—'}</td>
                    <td>{r.location || '—'}</td>
                    <td>{r.zendeskTicket || '—'}</td>
                    <td><RequestOutcome request={r} stationId={s.id} compact onChanged={loadRequests} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requests.length > 10 && <div className="muted">Showing the 10 most recent of {requests.length}.</div>}
          </div>
        )}

        <div className="label-row">Logged tickets <span className="muted">({events.length})</span></div>
        {events.length === 0 && <div className="muted">No tickets logged yet.</div>}
        {events.length > 0 && (
          <div className="table-wrap">
            <table className="table small">
              <thead><tr><th>Date</th><th>Ticket</th><th>Product</th><th className="num">Value</th><th>One trip</th><th>Flag</th></tr></thead>
              <tbody>
                {events.slice(0, 8).map((e) => (
                  <tr key={e.id}><td>{e.eventDate || '—'}</td><td>{e.zendeskTicket || '—'}</td><td>{e.product || '—'}</td><td className="num">{e.value != null ? fmtMoney(e.value, s.country, { cents: true }) : '—'}</td><td>{yn(e.oneTrip)}</td><td>{e.flagged ? '⚑' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
            {events.length > 8 && <div className="muted">Showing the 8 most recent of {events.length} entries.</div>}
          </div>
        )}
        {s.notes && (<><div className="label-row">Notes</div><div className="profile-notes">{s.notes}</div></>)}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Close</button>
          {onEdit && can(role, 'editStations') && <button className="primary" onClick={onEdit}>Edit station</button>}
        </div>
      </div>
    </div>
  )
}
