import { useState } from 'react'
import { useStations, useDispatches, useRole } from '../lib/useStore.js'
import { updateStation, addStation, advanceDispatch, isMasterRecord } from '../lib/store.js'
import { can } from '../lib/roles.js'
import { PRODUCTS, reliabilityScore } from '../lib/ratings.js'
import { geocodeAddress } from '../lib/geo.js'

export default function StationsPage() {
  const stations = useStations()
  const dispatches = useDispatches()
  const role = useRole()
  const [editing, setEditing] = useState(null) // station or 'new'

  return (
    <div className="stations-page">
      <section className="board">
        <h3>Dispatch board</h3>
        {dispatches.length === 0 && <div className="empty">No dispatches yet. Send one from Map &amp; Dispatch.</div>}
        <div className="board-grid">
          {dispatches.map((d) => (
            <div key={d.id} className={'dcard status-' + d.status}>
              <div className="dcard-head">
                <span className="dcard-id">{d.id}</span>
                <span className={'badge ' + d.status}>{d.status}</span>
              </div>
              <div className="dcard-title">{d.stationCompany}</div>
              <div className="muted">{d.product} · {d.consumer?.address}</div>
              {d.issue && <div className="dcard-issue">“{d.issue}”</div>}
              <div className="timeline">
                {d.timeline.map((t, i) => (
                  <span key={i}>{t.event} <em>{new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</em></span>
                ))}
              </div>
              {can(role, 'dispatch') && ['requested', 'accepted'].includes(d.status) && (
                <div className="dcard-actions">
                  {d.status === 'requested' && (
                    <>
                      <button className="ghost small" onClick={() => advanceDispatch(d.id, 'accepted')}>Mark accepted</button>
                      <button className="ghost small" onClick={() => advanceDispatch(d.id, 'declined')}>Declined</button>
                    </>
                  )}
                  {d.status === 'accepted' && (
                    <>
                      <button className="primary small" onClick={() => advanceDispatch(d.id, 'completed')}>Mark completed</button>
                      <button className="ghost small" onClick={() => advanceDispatch(d.id, 'issue', 'Issue reported on thread')}>Report issue</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="master">
        <div className="master-head">
          <h3>Master station list <span className="muted">({stations.length})</span></h3>
          {can(role, 'addStations') ? (
            <button className="primary" onClick={() => setEditing('new')}>+ Add station</button>
          ) : (
            <span className="lock">🔒 Read-only for your role — master list is protected</span>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Company</th><th>Location</th><th>Radius</th><th>Products</th>
                <th>Cert</th><th>Ins.</th><th>Score</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.company}</b>
                    {isMasterRecord(s.id) ? <span className="tag master-tag">master</span> : <span className="tag added-tag">added</span>}
                  </td>
                  <td>{s.city}, {s.state}</td>
                  <td>{s.serviceRadiusMi} mi</td>
                  <td className="prodcell">
                    {PRODUCTS.filter((p) => s.products?.[p.key]).map((p) => (
                      <span key={p.key} className="ptag">{p.label}</span>
                    ))}
                  </td>
                  <td>{s.hvacCertification || '—'}</td>
                  <td>{s.proofOfInsurance || '—'}</td>
                  <td><b>{reliabilityScore(s.perf)}</b></td>
                  <td><span className={'badge ' + s.status}>{s.status}</span></td>
                  <td>
                    {can(role, 'editStations') ? (
                      <button className="ghost small" onClick={() => setEditing(s)}>Edit</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <StationForm
          station={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function StationForm({ station, onClose }) {
  const isNew = !station
  const [f, setF] = useState(
    station || {
      company: '', serviceAddress: '', city: '', state: '', lat: '', lng: '',
      serviceRadiusMi: 25, phone: '', email: '', billingAddress: '',
      serviceType: 'On the road', holdsInventory: 'Yes',
      hvacCertification: '', proofOfInsurance: '', contractExpiry: '', insuranceExpiry: '',
      status: 'active', notes: '',
      products: { pumps: false, saltSystems: false, roboticCleaners: false, heatPumps: false, lights: false, filters: false },
    }
  )
  const [saving, setSaving] = useState(false)
  const [geoError, setGeoError] = useState(null)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setProd = (k, v) => setF((p) => ({ ...p, products: { ...p.products, [k]: v } }))

  async function save() {
    setGeoError(null)
    let lat = parseFloat(f.lat)
    let lng = parseFloat(f.lng)
    let precision = f.geocodePrecision || 'address'

    // If coordinates are blank, geocode the service address to drop a pinpoint pin.
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      const query = f.serviceAddress || `${f.city}, ${f.state}`
      if (!query.trim()) {
        setGeoError('Enter a service address (or lat/lng) so we can place the pin.')
        return
      }
      try {
        setSaving(true)
        const geo = await geocodeAddress(query)
        lat = geo.lat
        lng = geo.lng
        precision = 'address'
      } catch (err) {
        setSaving(false)
        setGeoError(`Could not geocode "${query}": ${err.message}. Enter lat/lng manually.`)
        return
      }
      setSaving(false)
    }

    const payload = {
      ...f,
      lat,
      lng,
      geocodePrecision: precision,
      serviceRadiusMi: parseInt(f.serviceRadiusMi, 10) || 25,
    }
    if (isNew) addStation(payload)
    else updateStation(station.id, payload)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Add service station' : 'Edit ' + station.company}</h3>
        {!isNew && isMasterRecord(station.id) && (
          <p className="muted">Edits are stored as an overlay — the original master record is preserved and restorable via Reset.</p>
        )}
        <div className="form-grid">
          <Field label="Company"><input value={f.company} onChange={(e) => set('company', e.target.value)} /></Field>
          <Field label="Service address"><input value={f.serviceAddress} onChange={(e) => set('serviceAddress', e.target.value)} /></Field>
          <Field label="City"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State"><input value={f.state} onChange={(e) => set('state', e.target.value)} maxLength={2} /></Field>
          <Field label="Latitude (blank = auto-geocode)"><input value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="auto from address" /></Field>
          <Field label="Longitude (blank = auto-geocode)"><input value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="auto from address" /></Field>
          <Field label="Service radius (mi)"><input type="number" value={f.serviceRadiusMi} onChange={(e) => set('serviceRadiusMi', e.target.value)} /></Field>
          <Field label="Service type">
            <select value={f.serviceType} onChange={(e) => set('serviceType', e.target.value)}>
              <option>On the road</option><option>Both (fixed + road)</option><option>Fixed location</option>
            </select>
          </Field>
          <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="HVAC certification"><input value={f.hvacCertification || ''} onChange={(e) => set('hvacCertification', e.target.value)} placeholder="On file / cert #" /></Field>
          <Field label="Proof of insurance"><input value={f.proofOfInsurance || ''} onChange={(e) => set('proofOfInsurance', e.target.value)} placeholder="On file" /></Field>
          <Field label="Insurance expiry"><input type="date" value={f.insuranceExpiry || ''} onChange={(e) => set('insuranceExpiry', e.target.value)} /></Field>
          <Field label="Contract expiry"><input type="date" value={f.contractExpiry || ''} onChange={(e) => set('contractExpiry', e.target.value)} /></Field>
          <Field label="Holds inventory">
            <select value={f.holdsInventory} onChange={(e) => set('holdsInventory', e.target.value)}><option>Yes</option><option>No</option></select>
          </Field>
          <Field label="Status">
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">active</option><option value="paused">paused</option><option value="prospect">prospect</option>
            </select>
          </Field>
        </div>

        <div className="label-row">Products serviced</div>
        <div className="product-grid">
          {PRODUCTS.map((p) => (
            <label key={p.key} className={f.products[p.key] ? 'chip active' : 'chip'}>
              <input type="checkbox" hidden checked={!!f.products[p.key]} onChange={(e) => setProd(p.key, e.target.checked)} />
              {p.label}
            </label>
          ))}
        </div>

        <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>

        {geoError && <div className="error">{geoError}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Geocoding…' : isNew ? 'Add station' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
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
