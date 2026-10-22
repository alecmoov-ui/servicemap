import { useEffect, useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'
import { api } from '../lib/api.js'
import { can } from '../lib/roles.js'
import { PRODUCTS, reliabilityScore, acceptanceRate, completionRate, productLabel } from '../lib/ratings.js'
import { complianceLabel, complianceClass, issueText } from '../lib/compliance.js'
import { stationPins, pinLabel } from '../lib/geo.js'
import { fmtRadius, region as regionInfo } from '../lib/units.js'
import LocatePreview from './LocatePreview.jsx'

const DOC_LABELS = { contract: 'Service Contract', schedule_a: 'Schedule A (Profile)', hvac_license: 'HVAC License', insurance: 'Proof of Insurance' }
const yn = (v) => (v ? 'Yes' : 'No')
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

// One clean address line from parts that may overlap (people often type the full
// address into the street field): split on commas, trim, drop blanks and repeats,
// drop a province/state code when its full name is already present, postal code last.
const REGION_NAMES = {
  AB: 'alberta', BC: 'british columbia', MB: 'manitoba', NB: 'new brunswick', NL: 'newfoundland and labrador', NS: 'nova scotia',
  NT: 'northwest territories', NU: 'nunavut', ON: 'ontario', PE: 'prince edward island', QC: 'quebec', SK: 'saskatchewan', YT: 'yukon',
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware',
  FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky',
  LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york',
  NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island',
  SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington',
  WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
}
const POSTAL = /^(?:[A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}(?:-\d{4})?)$/i
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
export function formatAddress(...parts) {
  const seen = new Set()
  const out = []
  for (const part of parts.flatMap((v) => String(v || '').split(','))) {
    const t = part.trim().replace(/\s+/g, ' ')
    const k = fold(t)
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  const names = new Set(out.map(fold))
  const kept = out.filter((t) => !(t.length === 2 && REGION_NAMES[t.toUpperCase()] && names.has(REGION_NAMES[t.toUpperCase()])))
  const postal = kept.filter((t) => POSTAL.test(t))
  return [...kept.filter((t) => !POSTAL.test(t)), ...postal].join(', ')
}

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
  useEffect(() => {
    api.getDocuments(s.id).then(setDocs).catch(() => {})
    api.getServiceEvents(s.id).then(setEvents).catch(() => {})
  }, [s.id])
  const info = regionInfo(s.country)
  const acc = acceptanceRate(s.perf)
  const comp = completionRate(s.perf)
  const pins = stationPins(s)

  return (
    <div className="modal-backdrop">
      <div className="modal wide profile" onClick={(e) => e.stopPropagation()}>
        <div className="profile-head">
          <div>
            <h3>{s.company}</h3>
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

        <div className="label-row">Performance <span className="muted">(derived from the service log)</span></div>
        <div className="card-stats">
          <span>Score {reliabilityScore(s.perf)}</span>
          <span>Requests {s.perf?.dispatchRequests ?? 0}</span>
          <span>Accept {acc != null ? Math.round(acc * 100) + '%' : '—'}</span>
          <span>Complete {comp != null ? Math.round(comp * 100) + '%' : '—'}</span>
          <span>Avg days {s.perf?.avgCompletionDays ?? '—'}</span>
        </div>
        {events.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table small">
              <thead><tr><th>Date</th><th>Ticket</th><th>Product</th><th>Accepted</th><th>Completed</th><th>Days</th></tr></thead>
              <tbody>
                {events.slice(0, 8).map((e) => (
                  <tr key={e.id}><td>{e.eventDate || '—'}</td><td>{e.zendeskTicket || '—'}</td><td>{e.product || '—'}</td><td>{yn(e.accepted)}</td><td>{yn(e.completed)}</td><td>{e.completionDays ?? '—'}</td></tr>
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
