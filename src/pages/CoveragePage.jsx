import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Popup } from 'react-leaflet'
import { TILE_OPTIONS } from '../lib/tiles.js'
import L from 'leaflet'
import { useStations } from '../lib/useStore.js'
import { haversineMiles } from '../lib/geo.js'
import { PRODUCTS } from '../lib/ratings.js'
import { METROS } from '../data/metros.js'

const FILTERS = [{ key: 'all', label: 'All products' }, ...PRODUCTS]

// Red gap marker sized by metro population (bigger = higher recruiting priority).
function gapIcon(pop) {
  const d = Math.max(14, Math.min(40, 12 + pop * 1.6))
  return L.divIcon({
    className: 'gap-pin',
    html: `<div class="gap-dot" style="width:${d}px;height:${d}px"></div>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
  })
}

export default function CoveragePage() {
  const [product, setProduct] = useState('all')
  const all = useStations().filter((s) => s.status === 'active')

  // Stations that service the selected product (all = whole active network).
  const stations = useMemo(
    () => (product === 'all' ? all : all.filter((s) => s.products?.[product])),
    [all, product]
  )

  // Coverage analysis per metro.
  const metros = useMemo(() => {
    return METROS.map((m) => {
      let nearest = Infinity
      let nearestStation = null
      let coveringCount = 0
      for (const s of stations) {
        const d = haversineMiles(m, s)
        if (d < nearest) {
          nearest = d
          nearestStation = s
        }
        if (d <= s.serviceRadiusMi) coveringCount++
      }
      return { ...m, nearest, nearestStation, coveringCount, covered: coveringCount > 0 }
    })
  }, [stations])

  const gaps = useMemo(
    () => metros.filter((m) => !m.covered).sort((a, b) => b.pop - a.pop),
    [metros]
  )

  const coveredPop = metros.filter((m) => m.covered).reduce((a, m) => a + m.pop, 0)
  const totalPop = metros.reduce((a, m) => a + m.pop, 0)
  const popCoverage = Math.round((coveredPop / totalPop) * 100)
  const coveredCount = metros.filter((m) => m.covered).length

  // Stations per state for the servicing set.
  const byState = useMemo(() => {
    const m = {}
    stations.forEach((s) => (m[s.state] = (m[s.state] || 0) + 1))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [stations])

  return (
    <div className="map-layout">
      <aside className="sidebar">
        <div className="search-block">
          <div className="label-row">Coverage for</div>
          <div className="product-grid">
            {FILTERS.map((p) => (
              <button
                key={p.key}
                className={product === p.key ? 'chip active' : 'chip'}
                onClick={() => setProduct(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="cov-kpis">
            <div className="cov-kpi">
              <b>{stations.length}</b>
              <span>stations</span>
            </div>
            <div className="cov-kpi">
              <b>{coveredCount}/{metros.length}</b>
              <span>metros covered</span>
            </div>
            <div className="cov-kpi">
              <b>{popCoverage}%</b>
              <span>population reached</span>
            </div>
          </div>

          <div className="legend">
            <span><i className="sw green" /> service radius (darker = denser)</span>
            <span><i className="sw red" /> uncovered metro (gap)</span>
            <span><i className="sw greenring" /> covered metro</span>
          </div>
        </div>

        <div className="results">
          <div className="results-head">
            🎯 Top recruiting targets — uncovered metros, by population
          </div>
          {gaps.length === 0 && <div className="empty">Every tracked metro is covered for this filter.</div>}
          {gaps.map((m) => (
            <div key={m.city} className="gap-row">
              <div className="gap-main">
                <b>{m.city}, {m.state}</b>
                <span className="gap-pop">{m.pop.toFixed(1)}M</span>
              </div>
              <div className="muted">
                Nearest station {m.nearest === Infinity ? '—' : Math.round(m.nearest) + ' mi'} away
                {m.nearestStation ? ` (${m.nearestStation.company})` : ''}
              </div>
            </div>
          ))}

          <div className="results-head" style={{ marginTop: 18 }}>Stations by state</div>
          <div className="state-coverage">
            {byState.map(([st, n]) => (
              <span key={st} className="state-chip">{st} <b>{n}</b></span>
            ))}
          </div>
        </div>
      </aside>

      <div className="map-pane">
        <MapContainer center={[39.5, -96]} zoom={4} className="map" scrollWheelZoom>
          <TileLayer {...TILE_OPTIONS} />

          {/* Density layer: overlapping radii shade darker where coverage is redundant */}
          {stations.map((s) => (
            <Circle
              key={'c' + s.id}
              center={[s.lat, s.lng]}
              radius={s.serviceRadiusMi * 1609.34}
              pathOptions={{ color: '#1f9d55', weight: 0, fillColor: '#1f9d55', fillOpacity: 0.14 }}
            />
          ))}
          {stations.map((s) => (
            <CircleMarker
              key={'d' + s.id}
              center={[s.lat, s.lng]}
              radius={3}
              pathOptions={{ color: '#0f6b39', fillColor: '#0f6b39', fillOpacity: 1, weight: 1 }}
            >
              <Popup>
                <strong>{s.company}</strong>
                <br />
                {s.city}, {s.state} · {s.serviceRadiusMi} mi
              </Popup>
            </CircleMarker>
          ))}

          {/* Metros: red gap pins (sized by population) or small green covered rings */}
          {metros.map((m) =>
            m.covered ? (
              <CircleMarker
                key={'m' + m.city}
                center={[m.lat, m.lng]}
                radius={5}
                pathOptions={{ color: '#1f9d55', fillColor: '#fff', fillOpacity: 1, weight: 2 }}
              >
                <Popup>
                  <strong>{m.city}, {m.state}</strong> · {m.pop}M
                  <br />✅ Covered — {m.coveringCount} station{m.coveringCount !== 1 ? 's' : ''} in range
                </Popup>
              </CircleMarker>
            ) : (
              <Marker key={'m' + m.city} position={[m.lat, m.lng]} icon={gapIcon(m.pop)}>
                <Popup>
                  <strong>{m.city}, {m.state}</strong> · {m.pop}M people
                  <br />❌ Gap — no {product === 'all' ? 'service' : FILTERS.find((f) => f.key === product).label} coverage
                  <br />Nearest: {Math.round(m.nearest)} mi ({m.nearestStation?.company})
                </Popup>
              </Marker>
            )
          )}
        </MapContainer>
      </div>
    </div>
  )
}
