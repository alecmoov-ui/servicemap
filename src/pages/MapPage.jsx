import { useMemo, useState } from 'react'
import MapView from '../components/MapView.jsx'
import DispatchModal from '../components/DispatchModal.jsx'
import { useStations, useRole } from '../lib/useStore.js'
import { geocodeAddress, haversineMiles } from '../lib/geo.js'
import { PRODUCTS, reliabilityScore, starRating, stars, acceptanceRate, completionRate } from '../lib/ratings.js'
import { can } from '../lib/roles.js'

// Built-in example service locations (coordinates included) so the full flow —
// ranked list, radius circles, dispatch — is clickable even on a network that
// blocks the live geocoder/tiles. Chosen near heat-pump-capable clusters.
const EXAMPLES = [
  { label: 'Orlando, FL', address: 'Orlando, FL', lat: 28.5383, lng: -81.3792 },
  { label: 'Miami, FL', address: 'Miami, FL', lat: 25.7749, lng: -80.1937 },
  { label: 'Tampa, FL', address: 'Tampa, FL', lat: 27.9506, lng: -82.4572 },
  { label: 'Palmdale, CA', address: 'Palmdale, CA', lat: 34.6868, lng: -118.1542 },
]

export default function MapPage() {
  const allStations = useStations()
  const role = useRole()
  const stations = allStations.filter((s) => s.status !== 'prospect')

  const [product, setProduct] = useState('heatPumps')
  const [address, setAddress] = useState('')
  const [consumer, setConsumer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [dispatchTarget, setDispatchTarget] = useState(null)

  // Stations that service the chosen product AND cover the consumer location,
  // ranked by reliability. No false positives: product + range are hard filters.
  const matches = useMemo(() => {
    if (!consumer) return []
    return stations
      .filter((s) => s.products?.[product])
      .map((s) => ({ ...s, distanceMi: haversineMiles(consumer, s) }))
      .filter((s) => s.distanceMi <= s.serviceRadiusMi)
      .sort((a, b) => reliabilityScore(b.perf) - reliabilityScore(a.perf) || a.distanceMi - b.distanceMi)
  }, [consumer, product, stations])

  async function onSearch(e) {
    e.preventDefault()
    if (!address.trim()) return
    setSearching(true)
    setError(null)
    try {
      const geo = await geocodeAddress(address)
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
                placeholder="Street, City, ST  (end-user location)"
              />
              <button className="primary" disabled={searching}>
                {searching ? '…' : 'Search'}
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}

          <div className="examples">
            <span>No internet / blocked? Try an example:</span>
            {EXAMPLES.map((ex) => (
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
        </div>

        <div className="results">
          {!consumer && (
            <div className="empty">
              Pick an equipment type and enter the end-user&apos;s address. We&apos;ll show only
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
                  <div className="card-title">{s.company}</div>
                  <div className="score" title="Reliability score">
                    {reliabilityScore(s.perf)}
                  </div>
                </div>
                <div className="card-stars" title={`${starRating(s.perf)} of 5`}>
                  {stars(starRating(s.perf))}
                </div>
                <div className="card-meta">
                  {s.distanceMi.toFixed(1)} mi · {s.city}, {s.state} · {s.serviceType}
                </div>
                <div className="card-stats">
                  <span>Accept {acc != null ? Math.round(acc * 100) + '%' : '—'}</span>
                  <span>Complete {comp != null ? Math.round(comp * 100) + '%' : '—'}</span>
                  <span>{s.holdsInventory === 'Yes' ? 'Holds inventory' : 'No inventory'}</span>
                </div>
                {selectedId === s.id && (
                  <div className="card-expand">
                    <div className="kv"><span>Phone</span><b>{s.phone}</b></div>
                    <div className="kv"><span>Email</span><b>{s.email}</b></div>
                    <div className="kv"><span>Insurance</span><b>{s.proofOfInsurance || 'Not on file'}</b></div>
                    <div className="kv"><span>HVAC cert</span><b>{s.hvacCertification || 'Not on file'}</b></div>
                    {can(role, 'dispatch') ? (
                      <button
                        className="primary block"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDispatchTarget(s)
                        }}
                      >
                        Send dispatch request
                      </button>
                    ) : (
                      <div className="muted">Your role cannot send dispatches.</div>
                    )}
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
        />
      </div>

      {dispatchTarget && (
        <DispatchModal
          station={dispatchTarget}
          consumer={consumer}
          product={PRODUCTS.find((p) => p.key === product).label}
          distanceMi={dispatchTarget.distanceMi}
          onClose={() => setDispatchTarget(null)}
        />
      )}
    </div>
  )
}
