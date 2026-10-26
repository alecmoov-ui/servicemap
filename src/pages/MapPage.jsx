import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StationProfile from '../components/StationProfile.jsx'
import CopyCard from '../components/CopyCard.jsx'
import RequestOutcome from '../components/RequestOutcome.jsx'
import { can } from '../lib/roles.js'
import MapView from '../components/MapView.jsx'
import { useStations, useApp } from '../lib/useStore.js'
import { fmtDist, fmtRadius, region as regionInfo } from '../lib/units.js'
import { api } from '../lib/api.js'
import { geocode } from '../lib/geocodeClient.js'
import { coveringPin, pinLabel, stationPins, countLabel } from '../lib/geo.js'
import { PRODUCTS, reliabilityScore, starRating, stars, acceptanceRate, completionRate, pct } from '../lib/ratings.js'

// Built-in example service locations (coordinates included) so the search flow —
// ranked list + radius circles — is usable even on a network that blocks the live
// geocoder/tiles. Chosen near heat-pump-capable clusters.
const EXAMPLES = {
  US: [
    { label: 'Orlando, FL', address: 'Orlando, FL', lat: 28.5383, lng: -81.3792 },
    { label: 'Miami, FL', address: 'Miami, FL', lat: 25.7749, lng: -80.1937 },
    { label: 'Tampa, FL', address: 'Tampa, FL', lat: 27.9506, lng: -82.4572 },
    { label: 'Palmdale, CA', address: 'Palmdale, CA', lat: 34.6868, lng: -118.1542 },
  ],
  CA: [
    { label: 'Toronto, ON', address: 'Toronto, ON', lat: 43.6532, lng: -79.3832 },
    { label: 'Vancouver, BC', address: 'Vancouver, BC', lat: 49.2827, lng: -123.1207 },
    { label: 'Montréal, QC', address: 'Montréal, QC', lat: 45.5019, lng: -73.5674 },
    { label: 'Calgary, AB', address: 'Calgary, AB', lat: 51.0447, lng: -114.0719 },
  ],
}

export default function MapPage() {
  const { region, role, requestDispatch } = useApp()
  const allStations = useStations() // active region only
  // Dispatch requests: confirm dialog, then +1 for the station; the card shows outcome chips.
  const [requesting, setRequesting] = useState(null) // station
  const [justRequested, setJustRequested] = useState({}) // stationId -> request
  const [openReqs, setOpenReqs] = useState([])
  const [showOpen, setShowOpen] = useState(false)
  const loadOpen = () => api.getOpenRequests(region).then(setOpenReqs).catch(() => {})
  useEffect(() => { loadOpen() }, [region]) // eslint-disable-line react-hooks/exhaustive-deps
  const stations = allStations.filter((s) => s.status === 'active')

  const [product, setProduct] = useState(PRODUCTS[0].key)
  const [address, setAddress] = useState('')
  const [consumer, setConsumer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showCoverage, setShowCoverage] = useState(false)
  const [profileId, setProfileId] = useState(null)
  const navigate = useNavigate()
  const profileStation = profileId ? allStations.find((s) => s.id === profileId) : null

  // Stations whose coverage circles overlay the map (the selected product's network).
  const coverageLabel = useMemo(
    () => (showCoverage ? countLabel(stations.filter((s) => s.products?.[product])) : ''),
    [showCoverage, stations, product]
  )

  // Stations that service the chosen product AND cover the consumer location,
  // ranked by reliability. No false positives: product + range are hard filters.
  const matches = useMemo(() => {
    if (!consumer) return []
    // A station matches if ANY of its pins (primary or additional service area)
    // covers the consumer; distance is to the nearest covering pin.
    return stations
      .filter((s) => s.products?.[product])
      .map((s) => ({ s, hit: coveringPin(consumer, s) }))
      .filter(({ hit }) => hit)
      .map(({ s, hit }) => ({ ...s, distanceMi: hit.distanceMi, viaPin: hit.pin }))
      .sort((a, b) => reliabilityScore(b.perf) - reliabilityScore(a.perf) || a.distanceMi - b.distanceMi)
  }, [consumer, product, stations])

  async function confirmRequest(ticket) {
    const s = requesting
    const productLabel = PRODUCTS.find((p) => p.key === product)?.label
    try {
      const r = await requestDispatch(s.id, { product: productLabel, location: consumer?.address || consumer?.label || null, zendeskTicket: ticket || null })
      setJustRequested((m) => ({ ...m, [s.id]: r }))
      setRequesting(null)
      loadOpen()
    } catch (e) { alert(e.message) }
  }

  async function onSearch(e) {
    e.preventDefault()
    if (!address.trim()) return
    setSearching(true)
    setError(null)
    try {
      const geo = await geocode(address, region)
      setConsumer({ ...geo, address })
      setSelectedId(null)
    } catch (err) {
      setError(err.message)
      setConsumer(null)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="map-layout">
      <aside className="sidebar">
        <div className="search-block">
          <div className="label-row">1 · Equipment type</div>
          <div className="product-grid">
            {PRODUCTS.map((p) => (
              <button
                key={p.key}
                className={product === p.key ? 'chip active' : 'chip'}
                onClick={() => setProduct(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSearch}>
            <div className="label-row">2 · Service address</div>
            <div className="search-row">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={region === 'CA' ? 'Street, City, Province  (end-user location)' : 'Street, City, ST  (end-user location)'}
              />
              <button className="primary" disabled={searching}>
                {searching ? '…' : 'Search'}
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}

          <div className="examples">
            <span>No internet / blocked? Try an example:</span>
            {EXAMPLES[region].map((ex) => (
              <button
                key={ex.label}
                className="chip-mini"
                onClick={() => {
                  setAddress(ex.address)
                  setConsumer(ex)
                  setSelectedId(null)
                  setError(null)
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <label className="coverage-toggle">
            <input type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} />
            <span>
              Show all <b>{PRODUCTS.find((p) => p.key === product).label}</b> coverage on the map
              {showCoverage ? ` — ${coverageLabel}` : ''}
            </span>
          </label>
        </div>

        {openReqs.length > 0 && (
          <div className="open-reqs">
            <button className="linkish" onClick={() => setShowOpen((v) => !v)}>
              {showOpen ? '▾' : '▸'} {openReqs.length} open dispatch request{openReqs.length !== 1 ? 's' : ''} awaiting an outcome
            </button>
            {showOpen && (
              <div className="open-reqs-list">
                {openReqs.slice(0, 12).map((r) => (
                  <div key={r.id} className="open-req">
                    <div>
                      <b>{r.company}</b> <span className="muted">· {r.product || 'any product'} · {new Date(r.requestedAt + 'Z').toLocaleDateString()}</span>
                    </div>
                    <RequestOutcome request={r} stationId={r.stationId} compact onChanged={loadOpen} />
                  </div>
                ))}
                <div className="muted" style={{ fontSize: 11.5 }}>Logging a completed ticket under the station resolves its request automatically.</div>
              </div>
            )}
          </div>
        )}

        <div className="results">
          {!consumer && (
            <div className="empty">
              Pick an equipment type and enter the end-user&apos;s address in{' '}
              <b>{regionInfo(region).label}</b> (switch region in the header). We&apos;ll show only
              vetted stations that service that product <i>and</i> cover the location, ranked by
              reliability.
            </div>
          )}
          {consumer && (
            <div className="results-head">
              {matches.length} station{matches.length !== 1 ? 's' : ''} in range for{' '}
              <b>{PRODUCTS.find((p) => p.key === product).label}</b>
            </div>
          )}
          {consumer && matches.length === 0 && (
            <div className="empty warn">
              No authorized {PRODUCTS.find((p) => p.key === product).label} station covers this
              location. This is a <b>coverage gap</b> — flag for recruiting (see Analytics).
            </div>
          )}

          {matches.map((s) => {
            const acc = acceptanceRate(s.perf)
            const comp = completionRate(s.perf)
            return (
              <div
                key={s.id}
                className={selectedId === s.id ? 'card selected' : 'card'}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="card-head">
                  <div className="card-title">{s.company} <CopyCard station={s} /></div>
                  <div className="score" title="Reliability score">
                    {reliabilityScore(s.perf)}
                  </div>
                </div>
                <div className="card-stars" title={`${starRating(s.perf)} of 5`}>
                  {stars(starRating(s.perf))}
                </div>
                <div className="card-meta">
                  {[fmtDist(s.distanceMi, region), s.viaPin.primary ? `${s.city}, ${s.state}` : `${pinLabel(s.viaPin)} location`, s.serviceType].filter(Boolean).join(' · ')}
                </div>
                {s.compliance && s.compliance.level !== 'ok' && (
                  <div className={'compliance-chip ' + s.compliance.level} title={s.compliance.issues.map((i) => i.message).join(' · ')}>
                    {s.compliance.level === 'expired' ? '✕ Compliance: action needed' : '⚠ Compliance: review'}
                  </div>
                )}
                <div className="card-stats">
                  <span>Req {s.perf?.dispatchRequests || 0}</span>
                  <span>Accept {pct(acc)}</span>
                  <span>Done {pct(comp)}</span>
                  <span>Flags {s.perf?.flags || 0}</span>
                  <span>{s.holdsInventory === 'Yes' ? 'Holds inventory' : 'No inventory'}</span>
                </div>
                {justRequested[s.id] && (
                  <div className="req-row">
                    <span className="muted">Requested just now.</span>
                    <RequestOutcome request={justRequested[s.id]} stationId={s.id} compact
                      onChanged={(r) => { setJustRequested((m) => ({ ...m, [s.id]: r })); loadOpen() }} />
                  </div>
                )}
                {selectedId === s.id && (
                  <div className="card-expand">
                    <div className="kv"><span>Contact</span><b>{s.primaryContact || '—'}{s.primaryContactTitle ? ` (${s.primaryContactTitle})` : ''}</b></div>
                    <div className="kv"><span>Phone</span><b>{s.phone || '—'}</b></div>
                    <div className="kv"><span>Email</span><b>{s.email || '—'}</b></div>
                    {(s.contacts || []).map((c, i) => (
                      <div className="kv" key={i}>
                        <span>{c.title || 'Contact'}</span>
                        <b>{[c.name, c.phone, c.email].filter(Boolean).join(' · ') || '—'}</b>
                      </div>
                    ))}
                    <div className="kv"><span>Coverage</span><b>{s.viaPin.polygon ? 'Drawn outline' : `${fmtRadius(s.viaPin.radiusMi, region)} radius`}{!s.viaPin.primary ? ` (${pinLabel(s.viaPin)})` : ''}</b></div>
                    {stationPins(s).length > 1 && (
                      <div className="kv"><span>Locations</span><b>{stationPins(s).map((p) => p.primary ? `${s.city}, ${s.state}` : pinLabel(p)).join(' · ')}</b></div>
                    )}
                    <div className="kv"><span>Insurance</span><b>{s.proofOfInsurance || (s.insuranceCarrier ? s.insuranceCarrier : 'Not on file')}</b></div>
                    <div className="kv"><span>HVAC license</span><b>{s.hvacLicense || s.hvacCertification || '—'}</b></div>
                    <div className="muted" style={{ marginTop: 8 }}>
                      Use these details to open/route the dispatch in Zendesk.
                    </div>
                    <div className="card-actions">
                      {can(role, 'logService') && (
                        <button className="primary small" onClick={(e) => { e.stopPropagation(); setRequesting(s) }}>
                          📞 Request dispatch
                        </button>
                      )}
                      <button className="ghost small" onClick={(e) => { e.stopPropagation(); setProfileId(s.id) }}>
                        Station profile →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <div className="map-pane">
        <MapView
          stations={stations}
          matches={matches}
          consumer={consumer}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onProfile={setProfileId}
          coverageProduct={showCoverage ? product : null}
          region={region}
        />
      </div>

      {requesting && (
        <RequestDialog
          station={requesting}
          product={PRODUCTS.find((p) => p.key === product)?.label}
          location={consumer?.address || consumer?.label}
          onCancel={() => setRequesting(null)}
          onConfirm={confirmRequest}
        />
      )}

      {profileStation && (
        <StationProfile
          station={profileStation}
          onClose={() => setProfileId(null)}
          onEdit={() => navigate(`/stations?open=${encodeURIComponent(profileStation.id)}&edit=1`)}
        />
      )}
    </div>
  )
}

// Quick confirmation before a request is counted against the station.
function RequestDialog({ station, product, location, onCancel, onConfirm }) {
  const [ticket, setTicket] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Request dispatch</h3>
        <p className="muted">This adds one dispatch request to the station's record. When the job is done, log the ticket under the station and it counts as accepted and completed.</p>
        <div className="kv"><span>Station</span><b>{station.company}</b></div>
        <div className="kv"><span>Phone</span><b>{station.phone || '—'}</b></div>
        <div className="kv"><span>Product</span><b>{product || '—'}</b></div>
        <div className="kv"><span>Service address</span><b>{location || '—'}</b></div>
        <label className="field" style={{ marginTop: 10 }}>
          <span>Zendesk ticket # (optional)</span>
          <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="e.g. 14872" autoFocus />
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="primary" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(ticket.trim()); setBusy(false) }}>
            {busy ? 'Saving…' : 'Yes, count this request'}
          </button>
        </div>
      </div>
    </div>
  )
}
