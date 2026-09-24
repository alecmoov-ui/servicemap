import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../lib/AppContext.jsx'
import { api } from '../lib/api.js'
import { can } from '../lib/roles.js'
import { PRODUCTS, reliabilityScore, acceptanceRate, completionRate } from '../lib/ratings.js'
import { geocode } from '../lib/geocodeClient.js'
import { stationStates, stationPins, countLabel } from '../lib/geo.js'
import LocatePreview from '../components/LocatePreview.jsx'

const DOC_SLOTS = [
  { key: 'contract', label: 'Service Contract' },
  { key: 'schedule_a', label: 'Schedule A (Profile)' },
  { key: 'hvac_license', label: 'HVAC License' },
  { key: 'insurance', label: 'Proof of Insurance' },
]

export default function StationsPage() {
  const { stations, role, refresh } = useApp()
  const [editing, setEditing] = useState(null) // station | 'new'
  const [logging, setLogging] = useState(null) // station
  const [backups, setBackups] = useState(false)
  const [importing, setImporting] = useState(false)
  const [merging, setMerging] = useState(null) // target station
  const [busy, setBusy] = useState(false)

  // State filter (A→Z). Options come from the stations actually on file.
  const [stateFilter, setStateFilter] = useState('')
  // A multi-location station counts under every state it has a pin in.
  const states = useMemo(() => [...new Set(stations.flatMap(stationStates))].sort(), [stations])
  const visible = useMemo(() => {
    const rows = stateFilter ? stations.filter((s) => stationStates(s).includes(stateFilter)) : stations
    // Sort by state, then company, so the list reads A→Z.
    return [...rows].sort((a, b) => (a.state || '').localeCompare(b.state || '') || a.company.localeCompare(b.company))
  }, [stations, stateFilter])

  async function exportCsv() {
    setBusy(true)
    try {
      await api.download('/stations/export.csv', `moov-stations-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeStation(s) {
    if (!confirm(`Remove ${s.company}? This can't be undone.`)) return
    try {
      await api.deleteStation(s.id)
      await refresh()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="stations-page">
      <section className="master">
        <div className="master-head">
          <h3>
            Master station list{' '}
            <span className="muted">{stateFilter ? `${countLabel(visible, stateFilter)} in ${stateFilter} · ${countLabel(stations)} total` : countLabel(stations)}</span>
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="state-filter" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} title="Filter by state">
              <option value="">All states</option>
              {states.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
            {can(role, 'exportData') && <button className="ghost" onClick={exportCsv} disabled={busy}>⬇ Export CSV</button>}
            {can(role, 'addStations') && <button className="ghost" onClick={() => setImporting(true)}>⬆ Import file</button>}
            {can(role, 'backups') && <button className="ghost" onClick={() => setBackups(true)}>Backups</button>}
            {can(role, 'addStations') ? (
              <button className="primary" onClick={() => setEditing('new')}>+ Add station</button>
            ) : (
              <span className="lock">🔒 Read-only for your role</span>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Company</th><th>City</th><th>State</th><th>Radius</th><th>Products</th>
                <th>Score</th><th>Accept</th><th>Avg days</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.company}</b>
                  </td>
                  <td>
                    {s.city}
                    {stationPins(s).length > 1 && (
                      <span className="tag added-tag" title={(s.serviceAreas || []).map((a) => a.label || `${a.city}, ${a.state}`).join(' · ')}>
                        +{stationPins(s).length - 1} location{stationPins(s).length > 2 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td><b>{stationStates(s).join(', ') || s.state}</b></td>
                  <td>{s.serviceRadiusMi} mi</td>
                  <td className="prodcell">
                    {PRODUCTS.filter((p) => s.products?.[p.key]).map((p) => (
                      <span key={p.key} className="ptag">{p.label}</span>
                    ))}
                  </td>
                  <td><b>{reliabilityScore(s.perf)}</b></td>
                  <td>{acceptanceRate(s.perf) != null ? Math.round(acceptanceRate(s.perf) * 100) + '%' : '—'}</td>
                  <td>{s.perf.avgCompletionDays != null ? s.perf.avgCompletionDays : '—'}</td>
                  <td><span className={'badge ' + s.status}>{s.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {can(role, 'logService') && <button className="ghost small" onClick={() => setLogging(s)}>Log</button>}{' '}
                    {can(role, 'editStations') && <button className="ghost small" onClick={() => setEditing(s)}>Edit</button>}{' '}
                    {can(role, 'deleteStations') && <button className="ghost small" onClick={() => setMerging(s)} title="Fold other records for this same company into this one">Merge</button>}{' '}
                    {can(role, 'deleteStations') && !s.isMaster && <button className="ghost small" onClick={() => removeStation(s)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <StationForm station={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {logging && <ServiceLogModal station={logging} onClose={() => setLogging(null)} />}
      {backups && <BackupsModal onClose={() => setBackups(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {merging && <MergeModal target={merging} onClose={() => setMerging(null)} />}
    </div>
  )
}

// --- Merge duplicate records for one entity ----------------------------------

const normCo = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function MergeModal({ target, onClose }) {
  const { stations, refresh } = useApp()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Pre-select records whose company name matches the target (typical duplicates).
  const [picked, setPicked] = useState(() => new Set(
    stations.filter((s) => s.id !== target.id && !s.isMaster && normCo(s.company) === normCo(target.company)).map((s) => s.id),
  ))
  const candidates = stations
    .filter((s) => s.id !== target.id)
    .filter((s) => !q.trim() || normCo(s.company).includes(normCo(q)) || picked.has(s.id))
    .sort((a, b) => (picked.has(b.id) - picked.has(a.id)) || a.company.localeCompare(b.company))
    .slice(0, 40)
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function merge() {
    const ids = [...picked]
    if (!ids.length) return setError('Select at least one record to merge in.')
    const names = stations.filter((s) => ids.includes(s.id)).map((s) => `${s.company} (${s.city}, ${s.state})`)
    if (!confirm(`Merge ${ids.length} record${ids.length > 1 ? 's' : ''} into ${target.company}?\n\n${names.join('\n')}\n\nTheir locations become service areas of ${target.company}; contacts, service log and documents move over; the merged records are removed. A database snapshot can be restored from Backups if needed.`)) return
    setBusy(true); setError(null)
    try {
      await api.mergeStations(target.id, ids)
      await refresh()
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Merge into {target.company}</h3>
        <p className="muted">
          Keeps <b>{target.company}</b> ({target.city}, {target.state}) as the one record. Each selected
          record's address becomes an <b>additional service area</b> with its own pin and radius; its
          contacts, service-log entries and documents move over; then it is removed. Master records
          can't be merged away — open the master and merge into it instead.
        </p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search other stations by company…" />
        <div className="merge-list">
          {candidates.map((s) => (
            <label key={s.id} className={'merge-row' + (picked.has(s.id) ? ' on' : '') + (s.isMaster ? ' disabled' : '')}>
              <input type="checkbox" checked={picked.has(s.id)} disabled={s.isMaster} onChange={() => toggle(s.id)} />
              <span><b>{s.company}</b> <span className="muted">· {s.city}, {s.state} · {s.serviceRadiusMi} mi</span></span>
              {s.isMaster && <span className="tag master-tag">master</span>}
            </label>
          ))}
          {candidates.length === 0 && <div className="muted">No other stations match.</div>}
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={merge} disabled={busy || picked.size === 0}>
            {busy ? 'Merging…' : `Merge ${picked.size || ''} into ${target.company}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Bulk import -----------------------------------------------------------

function ImportModal({ onClose }) {
  const { refresh } = useApp()
  const [history, setHistory] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const loadHistory = () => api.getImports().then(setHistory).catch(() => {})
  useEffect(() => { loadHistory() }, [])

  async function upload(file) {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await api.importStations(file)
      setResult(r)
      await refresh() // new/updated stations flow into Map, Zone Coverage, Analytics
      loadHistory()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Import stations from a file</h3>
        <p className="muted">
          Round-trip your list: <b>Export CSV</b> (or download a blank template), edit/add rows in Excel,
          then upload here (<code>.xlsx</code> or <code>.csv</code>). Rows match by the <b>ID</b> column —
          blank ID creates a new station (address is auto-located); filled ID updates it. A database
          snapshot is taken automatically before applying, so you can roll back.
        </p>

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="ghost" onClick={() => api.download('/stations/export.csv', 'moov-stations.csv')}>⬇ Export current</button>
          <button className="ghost" onClick={() => api.download('/stations/import-template.csv', 'moov-stations-template.csv')}>⬇ Blank template</button>
          <label className="primary upload-btn" style={{ padding: '8px 14px', borderRadius: 8 }}>
            {busy ? 'Uploading…' : 'Choose file & upload'}
            <input type="file" hidden accept=".csv,.xlsx" disabled={busy} onChange={(e) => upload(e.target.files[0])} />
          </label>
        </div>

        {error && <div className="error">{error}</div>}

        {result && (
          <div className="import-result">
            <div className="import-counts">
              <span className="badge active">{result.created} created</span>
              <span className="badge paused">{result.updated} updated</span>
              {result.errors.length > 0 && <span className="badge issue">{result.errors.length} errors</span>}
              {result.warnings.length > 0 && <span className="badge requested">{result.warnings.length} warnings</span>}
            </div>
            {(result.errors.length > 0 || result.warnings.length > 0) && (
              <ul className="import-issues">
                {result.errors.map((e, i) => <li key={'e' + i} className="err">Row {e.row}: {e.message}</li>)}
                {result.warnings.map((w, i) => <li key={'w' + i} className="warn">Row {w.row}: {w.message}</li>)}
              </ul>
            )}
            {result.snapshot && <div className="muted">Snapshot before import: <code>{result.snapshot}</code></div>}
          </div>
        )}

        <div className="label-row">Import history ({history.length})</div>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>File</th><th>When</th><th>By</th><th>Result</th><th></th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td style={{ fontSize: 12 }}>{h.originalName}</td>
                  <td className="muted">{new Date(h.uploadedAt + 'Z').toLocaleString()}</td>
                  <td className="muted">{h.uploadedBy}</td>
                  <td style={{ fontSize: 12 }}>+{h.created} / ~{h.updated}{h.errors ? ` / !${h.errors}` : ''}</td>
                  <td><button className="ghost small" onClick={() => api.download(`/stations/imports/${h.id}/download`, h.originalName)}>Download</button></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 12 }}>No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          To roll back, download a previous version and re-upload it, or restore the snapshot (Backups).
        </p>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// --- Service log -----------------------------------------------------------

function ServiceLogModal({ station, onClose }) {
  const { logServiceEvent, role } = useApp()
  const [events, setEvents] = useState([])
  const [f, setF] = useState({ zendeskTicket: '', product: '', eventDate: new Date().toISOString().slice(0, 10), accepted: true, completed: false, completionDays: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const load = () => api.getServiceEvents(station.id).then(setEvents).catch(() => {})
  useEffect(() => { load() }, [station.id])

  async function add() {
    setBusy(true); setError(null)
    try {
      await logServiceEvent(station.id, {
        ...f,
        completionDays: f.completed && f.completionDays !== '' ? Number(f.completionDays) : null,
      })
      setF((p) => ({ ...p, zendeskTicket: '', notes: '', completionDays: '' }))
      load()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function remove(id) {
    if (!confirm('Remove this log entry?')) return
    await api.deleteServiceEvent(station.id, id)
    load()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>Service log — {station.company}</h3>
        <p className="muted">
          Enter the outcome of a resolved Zendesk ticket. Performance metrics (acceptance %, completion %,
          avg duration) and the map ranking update automatically.
        </p>

        <div className="form-grid">
          <Field label="Zendesk ticket #"><input value={f.zendeskTicket} onChange={(e) => set('zendeskTicket', e.target.value)} placeholder="e.g. 14872" /></Field>
          <Field label="Date sent"><input type="date" value={f.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></Field>
          <Field label="Product">
            <select value={f.product} onChange={(e) => set('product', e.target.value)}>
              <option value="">—</option>
              {PRODUCTS.map((p) => <option key={p.key} value={p.label}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Days to complete"><input type="number" min="0" step="0.5" value={f.completionDays} onChange={(e) => set('completionDays', e.target.value)} disabled={!f.completed} /></Field>
        </div>
        <div className="product-grid" style={{ marginTop: 10 }}>
          <label className={f.accepted ? 'chip active' : 'chip'}>
            <input type="checkbox" hidden checked={f.accepted} onChange={(e) => set('accepted', e.target.checked)} /> Accepted
          </label>
          <label className={f.completed ? 'chip active' : 'chip'}>
            <input type="checkbox" hidden checked={f.completed} onChange={(e) => set('completed', e.target.checked)} /> Completed
          </label>
        </div>
        <Field label="Notes"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="optional" /></Field>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Close</button>
          <button className="primary" onClick={add} disabled={busy}>{busy ? 'Saving…' : 'Add log entry'}</button>
        </div>

        <div className="label-row">Recent entries ({events.length})</div>
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Date</th><th>Ticket</th><th>Product</th><th>Outcome</th><th>Days</th><th></th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{e.eventDate}</td>
                  <td>{e.zendeskTicket || '—'}</td>
                  <td>{e.product || '—'}</td>
                  <td>{e.accepted ? (e.completed ? 'Completed' : 'Accepted') : 'Declined'}</td>
                  <td>{e.completionDays ?? '—'}</td>
                  <td>{can(role, 'logService') && <button className="ghost small" onClick={() => remove(e.id)}>✕</button>}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 12 }}>No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// --- Backups ---------------------------------------------------------------

function BackupsModal({ onClose }) {
  const [snaps, setSnaps] = useState([])
  const [busy, setBusy] = useState(false)
  const load = () => api.getSnapshots().then(setSnaps).catch(() => {})
  useEffect(() => { load() }, [])

  async function create() {
    setBusy(true)
    try { await api.createSnapshot(); load() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Database backups</h3>
        <p className="muted">
          Snapshots are full database save-points. Combined with the weekly scheduled backup and the CSV
          export, these are your data rollback points. Restoring is an ops step (see README).
        </p>
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create snapshot now'}</button>
        </div>
        <div className="table-wrap" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr><th>Snapshot</th><th>When</th><th></th></tr></thead>
            <tbody>
              {snaps.map((s) => (
                <tr key={s.name}>
                  <td style={{ fontSize: 12 }}>{s.name}</td>
                  <td className="muted">{new Date(s.at).toLocaleString()}</td>
                  <td><button className="ghost small" onClick={() => api.download(`/admin/snapshots/${s.name}/download`, s.name)}>Download</button></td>
                </tr>
              ))}
              {snaps.length === 0 && <tr><td colSpan={3} className="muted" style={{ padding: 12 }}>No snapshots yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// --- Station add/edit form -------------------------------------------------

function StationForm({ station, onClose }) {
  const { createStation, updateStation } = useApp()
  const isNew = !station
  const [f, setF] = useState(
    station || {
      company: '', serviceAddress: '', city: '', state: '', zip: '', lat: '', lng: '', serviceRadiusMi: 25,
      taxId: '', primaryContact: '', primaryContactTitle: '', phone: '', email: '', billingAddress: '', shippingAddress: '',
      serviceType: 'On the road', holdsInventory: 'Yes', totalTechnicians: '',
      hvacCertification: '', hvacLicense: '', epa608Techs: '', epa608Level: '',
      proofOfInsurance: '', insuranceCarrier: '', glLimits: '', insuranceExpiry: '',
      contractExpiry: '', effectiveDate: '', status: 'active', notes: '',
      products: { pumps: false, saltSystems: false, roboticCleaners: false, lights: false, filters: false, heatPumpElectrical: false, heatPumpRefrigerant: false },
      partsCategories: [],
      contacts: [],
      serviceAreas: [],
    }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [locating, setLocating] = useState(false)
  const [geoMsg, setGeoMsg] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const addContact = () => setF((p) => ({ ...p, contacts: [...(p.contacts || []), { name: '', title: '', phone: '', email: '' }] }))
  const setContact = (i, k, v) => setF((p) => {
    const contacts = [...(p.contacts || [])]
    contacts[i] = { ...contacts[i], [k]: v }
    return { ...p, contacts }
  })
  const removeContact = (i) => setF((p) => ({ ...p, contacts: (p.contacts || []).filter((_, j) => j !== i) }))

  // Additional service areas (extra pins for the same entity, each with its own radius).
  const [areaMsg, setAreaMsg] = useState({})
  const addArea = () => setF((p) => ({ ...p, serviceAreas: [...(p.serviceAreas || []), { label: '', address: '', city: '', state: '', zip: '', lat: null, lng: null, radiusMi: 25 }] }))
  const setArea = (i, k, v) => setF((p) => {
    const serviceAreas = [...(p.serviceAreas || [])]
    // Editing the address invalidates the old pin so it gets re-located on save.
    const reset = ['address', 'city', 'state', 'zip'].includes(k) ? { lat: null, lng: null } : {}
    serviceAreas[i] = { ...serviceAreas[i], ...reset, [k]: v }
    return { ...p, serviceAreas }
  })
  const removeArea = (i) => setF((p) => ({ ...p, serviceAreas: (p.serviceAreas || []).filter((_, j) => j !== i) }))
  const areaQuery = (a) => [a.address, a.city, a.state, a.zip].filter(Boolean).join(', ')
  async function locateArea(i) {
    const a = f.serviceAreas[i]
    const query = areaQuery(a)
    if (!query.trim()) return setAreaMsg((m) => ({ ...m, [i]: 'Enter an address or city/state first.' }))
    setAreaMsg((m) => ({ ...m, [i]: 'Locating…' }))
    try {
      const geo = await geocode(query)
      setF((p) => {
        const serviceAreas = [...(p.serviceAreas || [])]
        serviceAreas[i] = { ...serviceAreas[i], lat: geo.lat, lng: geo.lng }
        return { ...p, serviceAreas }
      })
      setAreaMsg((m) => ({ ...m, [i]: (geo.approximate ? '≈ ' : '✓ ') + (geo.label || '').slice(0, 60) }))
    } catch (e) {
      setAreaMsg((m) => ({ ...m, [i]: 'Could not locate: ' + e.message }))
    }
  }

  // Build the best geocoding query from the address parts (incl. zip).
  const geoQuery = () => [f.serviceAddress, f.city, f.state, f.zip].filter(Boolean).join(', ')

  // Turn the typed address into coordinates so the coverage circle can render.
  async function locate() {
    setGeoMsg(null)
    const query = geoQuery()
    if (!query.trim()) return setGeoMsg('Enter a service address, or city/state/zip, first.')
    try {
      setLocating(true)
      const geo = await geocode(query)
      setF((p) => ({ ...p, lat: geo.lat, lng: geo.lng, geocodePrecision: geo.approximate ? 'approx' : 'address' }))
      setGeoMsg((geo.approximate ? '≈ Approximate (area matched — fine for a radius): ' : '✓ Located: ') + (geo.label || '').slice(0, 70))
    } catch (e) {
      setGeoMsg('Could not locate that address: ' + e.message)
    } finally {
      setLocating(false)
    }
  }
  const setProd = (k, v) => setF((p) => ({ ...p, products: { ...p.products, [k]: v } }))
  const togglePart = (k) => setF((p) => ({ ...p, partsCategories: p.partsCategories.includes(k) ? p.partsCategories.filter((x) => x !== k) : [...p.partsCategories, k] }))

  async function save() {
    setError(null)
    let lat = parseFloat(f.lat)
    let lng = parseFloat(f.lng)
    let precision = f.geocodePrecision || 'address'
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      const query = geoQuery()
      if (!query.trim()) return setError('Enter a service address (or lat/lng) so we can place the pin.')
      try {
        setSaving(true)
        const geo = await geocode(query)
        lat = geo.lat; lng = geo.lng; precision = 'address'
      } catch (err) {
        setSaving(false)
        return setError(`Could not geocode "${query}": ${err.message}. Enter lat/lng manually.`)
      }
    }
    // Additional areas: drop empty rows, geocode any that still lack a pin.
    const serviceAreas = []
    for (const a of f.serviceAreas || []) {
      const query = areaQuery(a)
      if (!query.trim() && a.lat == null) continue
      let { lat: alat, lng: alng } = a
      if (alat == null || alng == null) {
        try {
          setSaving(true)
          const geo = await geocode(query)
          alat = geo.lat; alng = geo.lng
        } catch (err) {
          setSaving(false)
          return setError(`Could not locate service area "${query}": ${err.message}`)
        }
      }
      serviceAreas.push({ ...a, lat: alat, lng: alng, radiusMi: parseInt(a.radiusMi, 10) || 25 })
    }
    const { id, isMaster, perf, createdAt, compliance, ...editable } = f
    const num = (v) => (v === '' || v == null ? null : Number(v))
    const payload = {
      ...editable, lat, lng, geocodePrecision: precision,
      serviceRadiusMi: parseInt(f.serviceRadiusMi, 10) || 25,
      totalTechnicians: num(f.totalTechnicians), epa608Techs: num(f.epa608Techs),
      contacts: (f.contacts || []).filter((c) => c.name || c.title || c.phone || c.email),
      serviceAreas,
    }
    try {
      setSaving(true)
      if (isNew) await createStation(payload)
      else await updateStation(station.id, payload)
      onClose()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Add service station' : 'Edit ' + station.company}</h3>
        {!isNew && station.isMaster && (
          <p className="muted">Master record — editable but protected from deletion.</p>
        )}

        <div className="label-row">Business & location</div>
        <div className="form-grid">
          <Field label="Company (legal)"><input value={f.company} onChange={(e) => set('company', e.target.value)} /></Field>
          <Field label="Tax ID / EIN"><input value={f.taxId || ''} onChange={(e) => set('taxId', e.target.value)} /></Field>
          <Field label="Service address"><input value={f.serviceAddress} onChange={(e) => set('serviceAddress', e.target.value)} /></Field>
          <Field label="City"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State"><input value={f.state} onChange={(e) => set('state', e.target.value)} maxLength={2} /></Field>
          <Field label="Zip code"><input value={f.zip || ''} onChange={(e) => set('zip', e.target.value)} placeholder="e.g. 33809" /></Field>
          <Field label="Service radius (miles)"><input type="number" min="1" value={f.serviceRadiusMi} onChange={(e) => set('serviceRadiusMi', e.target.value)} /></Field>
          <Field label="Primary contact"><input value={f.primaryContact || ''} onChange={(e) => set('primaryContact', e.target.value)} /></Field>
          <Field label="Contact title"><input value={f.primaryContactTitle || ''} onChange={(e) => set('primaryContactTitle', e.target.value)} /></Field>
          <Field label="Phone"><input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input value={f.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Billing address"><input value={f.billingAddress || ''} onChange={(e) => set('billingAddress', e.target.value)} /></Field>
          <Field label="Shipping address"><input value={f.shippingAddress || ''} onChange={(e) => set('shippingAddress', e.target.value)} /></Field>
          <Field label="Service type">
            <select value={f.serviceType || ''} onChange={(e) => set('serviceType', e.target.value)}>
              <option>On the road</option><option>Both (fixed + road)</option><option>Fixed location</option>
            </select>
          </Field>
          <Field label="Total technicians"><input type="number" value={f.totalTechnicians ?? ''} onChange={(e) => set('totalTechnicians', e.target.value)} /></Field>
          <Field label="Status">
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">active</option><option value="paused">paused</option><option value="prospect">prospect</option>
            </select>
          </Field>
        </div>

        <div className="locate-row">
          <button type="button" className="ghost" onClick={locate} disabled={locating}>
            {locating ? 'Locating…' : '📍 Locate address & preview radius'}
          </button>
          {geoMsg && <span className="muted">{geoMsg}</span>}
        </div>
        <LocatePreview lat={parseFloat(f.lat)} lng={parseFloat(f.lng)} radiusMi={parseInt(f.serviceRadiusMi, 10) || 25} areas={f.serviceAreas || []} />
        <details className="coords-details">
          <summary>Coordinates (auto-filled from the address — only adjust if a pin lands wrong)</summary>
          <div className="form-grid">
            <Field label="Latitude"><input value={f.lat ?? ''} onChange={(e) => set('lat', e.target.value)} placeholder="auto from address" /></Field>
            <Field label="Longitude"><input value={f.lng ?? ''} onChange={(e) => set('lng', e.target.value)} placeholder="auto from address" /></Field>
          </div>
        </details>

        <div className="label-row">Additional service areas <span className="muted">(same company, more locations — each gets its own pin & radius; contacts and documents are shared)</span></div>
        <div className="contacts-list">
          {(f.serviceAreas || []).map((a, i) => (
            <div key={i}>
              <div className="area-row">
                <input placeholder="Label (e.g. Naples branch)" value={a.label || ''} onChange={(e) => setArea(i, 'label', e.target.value)} />
                <input placeholder="Street address" value={a.address || ''} onChange={(e) => setArea(i, 'address', e.target.value)} />
                <input placeholder="City" value={a.city || ''} onChange={(e) => setArea(i, 'city', e.target.value)} />
                <input placeholder="ST" maxLength={2} value={a.state || ''} onChange={(e) => setArea(i, 'state', e.target.value.toUpperCase())} />
                <input placeholder="Zip" value={a.zip || ''} onChange={(e) => setArea(i, 'zip', e.target.value)} />
                <input type="number" min="1" title="Radius (miles)" value={a.radiusMi ?? 25} onChange={(e) => setArea(i, 'radiusMi', e.target.value)} />
                <button type="button" className="ghost small" onClick={() => locateArea(i)} title="Locate on the map">📍</button>
                <button type="button" className="ghost small" onClick={() => removeArea(i)} title="Remove this area">✕</button>
              </div>
              <div className="muted area-status">
                {areaMsg[i] || (a.lat != null ? `✓ Pinned (${Number(a.lat).toFixed(3)}, ${Number(a.lng).toFixed(3)}) · ${a.radiusMi || 25} mi` : 'Not located yet — located automatically on save.')}
              </div>
            </div>
          ))}
          {(f.serviceAreas || []).length === 0 && <div className="muted">Single location. Add an area if this company also covers another region from a different address.</div>}
        </div>
        <button type="button" className="ghost small" onClick={addArea} style={{ marginTop: 8 }}>+ Add service area</button>

        <div className="label-row">Additional contacts <span className="muted">(who to address — beyond the primary contact above)</span></div>
        <div className="contacts-list">
          {(f.contacts || []).map((c, i) => (
            <div className="contact-row" key={i}>
              <input placeholder="Name" value={c.name || ''} onChange={(e) => setContact(i, 'name', e.target.value)} />
              <input placeholder="Role / title" value={c.title || ''} onChange={(e) => setContact(i, 'title', e.target.value)} />
              <input placeholder="Phone" value={c.phone || ''} onChange={(e) => setContact(i, 'phone', e.target.value)} />
              <input placeholder="Email" value={c.email || ''} onChange={(e) => setContact(i, 'email', e.target.value)} />
              <button type="button" className="ghost small" onClick={() => removeContact(i)}>✕</button>
            </div>
          ))}
          {(f.contacts || []).length === 0 && <div className="muted">No additional contacts yet.</div>}
        </div>
        <button type="button" className="ghost small" onClick={addContact} style={{ marginTop: 8 }}>+ Add contact</button>

        <div className="label-row">Products qualified to service</div>
        <div className="product-grid">
          {PRODUCTS.map((p) => (
            <label key={p.key} className={f.products[p.key] ? 'chip active' : 'chip'}>
              <input type="checkbox" hidden checked={!!f.products[p.key]} onChange={(e) => setProd(p.key, e.target.checked)} />{p.label}
            </label>
          ))}
        </div>

        <div className="label-row">Heat-pump / HVAC (if servicing heat pumps)</div>
        <div className="form-grid">
          <Field label="HVAC contractor license (# + state)"><input value={f.hvacLicense || ''} onChange={(e) => set('hvacLicense', e.target.value)} /></Field>
          <Field label="HVAC certification note"><input value={f.hvacCertification || ''} onChange={(e) => set('hvacCertification', e.target.value)} placeholder="On file / cert #" /></Field>
          <Field label="# EPA 608-certified techs"><input type="number" value={f.epa608Techs ?? ''} onChange={(e) => set('epa608Techs', e.target.value)} /></Field>
          <Field label="Highest EPA 608 level">
            <select value={f.epa608Level || ''} onChange={(e) => set('epa608Level', e.target.value)}>
              <option value="">—</option><option>Type I</option><option>Type II</option><option>Type III</option><option>Universal</option>
            </select>
          </Field>
        </div>

        <div className="label-row">Insurance & agreement</div>
        <div className="form-grid">
          <Field label="Insurance carrier"><input value={f.insuranceCarrier || ''} onChange={(e) => set('insuranceCarrier', e.target.value)} /></Field>
          <Field label="GL limits (per occ / aggregate)"><input value={f.glLimits || ''} onChange={(e) => set('glLimits', e.target.value)} placeholder="$1M / $2M" /></Field>
          <Field label="Insurance expiry"><input type="date" value={f.insuranceExpiry || ''} onChange={(e) => set('insuranceExpiry', e.target.value)} /></Field>
          <Field label="Proof of insurance note"><input value={f.proofOfInsurance || ''} onChange={(e) => set('proofOfInsurance', e.target.value)} placeholder="On file" /></Field>
          <Field label="Agreement effective date"><input type="date" value={f.effectiveDate || ''} onChange={(e) => set('effectiveDate', e.target.value)} /></Field>
          <Field label="Contract expiry"><input type="date" value={f.contractExpiry || ''} onChange={(e) => set('contractExpiry', e.target.value)} /></Field>
          <Field label="Holds Moov inventory">
            <select value={f.holdsInventory || 'No'} onChange={(e) => set('holdsInventory', e.target.value)}><option>Yes</option><option>No</option></select>
          </Field>
        </div>
        {f.holdsInventory === 'Yes' && (
          <>
            <div className="label-row">Parts categories held</div>
            <div className="product-grid">
              {PRODUCTS.map((p) => (
                <label key={p.key} className={(f.partsCategories || []).includes(p.key) ? 'chip active' : 'chip'}>
                  <input type="checkbox" hidden checked={(f.partsCategories || []).includes(p.key)} onChange={() => togglePart(p.key)} />{p.label}
                </label>
              ))}
            </div>
          </>
        )}

        <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>

        {!isNew && <DocumentsSection stationId={station.id} />}
        {isNew && <p className="muted">Save the station first, then re-open it to upload documents.</p>}

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add station' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

function DocumentsSection({ stationId }) {
  const [docs, setDocs] = useState([])
  const [busy, setBusy] = useState(null)
  const load = () => api.getDocuments(stationId).then(setDocs).catch(() => {})
  useEffect(() => { load() }, [stationId])
  const byType = (t) => docs.find((d) => d.docType === t)

  async function upload(docType, file) {
    if (!file) return
    setBusy(docType)
    try { await api.uploadDocument(stationId, docType, file); load() } catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  async function remove(doc) {
    if (!confirm('Remove this document?')) return
    await api.deleteDocument(stationId, doc.id); load()
  }

  return (
    <>
      <div className="label-row">Documents</div>
      <div className="docs">
        {DOC_SLOTS.map((slot) => {
          const doc = byType(slot.key)
          return (
            <div key={slot.key} className="doc-row">
              <div className="doc-label">{slot.label}</div>
              {doc ? (
                <div className="doc-actions">
                  <button className="ghost small" onClick={() => api.download(`/stations/${stationId}/documents/${doc.id}/download`, doc.originalName)}>⬇ {doc.originalName}</button>
                  <button className="ghost small" onClick={() => remove(doc)}>✕</button>
                </div>
              ) : (
                <label className="ghost small upload-btn">
                  {busy === slot.key ? 'Uploading…' : 'Upload'}
                  <input type="file" hidden onChange={(e) => upload(slot.key, e.target.files[0])} />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
