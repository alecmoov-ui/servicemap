// Geospatial helpers — distances and address geocoding.

const R_MILES = 3958.8

// Great-circle distance in miles between two {lat,lng} points.
export function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_MILES * Math.asin(Math.sqrt(h))
}

// Geocoding now goes through the backend proxy (server caches results and sets a
// proper User-Agent). See src/lib/api.js -> api.geocode.

// ---- Multi-location stations ------------------------------------------------
// A station's PRIMARY pin is its own address/lat/lng/radius; `serviceAreas` holds
// extra pins for the same entity. Everything geographic (search, map, coverage,
// state filter) should go through these helpers rather than s.lat/s.lng directly.

const hasCoords = (p) => p.lat != null && p.lng != null && !Number.isNaN(Number(p.lat)) && !Number.isNaN(Number(p.lng))

// A pin covers either its radius circle or, when drawn, its outline polygon.
export function stationPins(s) {
  const primary = { key: s.id + ':0', label: '', address: s.serviceAddress, city: s.city, state: s.state, lat: s.lat, lng: s.lng, radiusMi: s.serviceRadiusMi || 25, polygon: validPolygon(s.coveragePolygon), primary: true }
  const extra = (s.serviceAreas || []).map((a, i) => ({ key: `${s.id}:${i + 1}`, ...a, radiusMi: a.radiusMi || 25, polygon: validPolygon(a.polygon), primary: false }))
  return [primary, ...extra].filter(hasCoords)
}

export const validPolygon = (poly) => (Array.isArray(poly) && poly.length >= 3 ? poly : null)

// Ray-casting point-in-polygon on [lat, lng] pairs (fine at service-area scale).
export function pointInPolygon(point, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j]
    const intersect = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export const pinCovers = (point, pin) => (pin.polygon ? pointInPolygon(point, pin.polygon) : haversineMiles(point, pin) <= pin.radiusMi)

// Distinct states covered by a station (primary + areas), A→Z.
export function stationStates(s) {
  const all = [s.state, ...(s.serviceAreas || []).map((a) => a.state)]
  return [...new Set(all.map((st) => String(st || '').trim().toUpperCase()).filter(Boolean))].sort()
}

// Nearest pin whose radius covers `point`, or null if none does.
export function coveringPin(point, s) {
  let best = null
  for (const pin of stationPins(s)) {
    const d = haversineMiles(point, pin)
    if (pinCovers(point, pin) && (!best || d < best.distanceMi)) best = { pin, distanceMi: d }
  }
  return best
}

// Short label for a pin: "Naples branch" / "Naples, FL".
export const pinLabel = (pin) => pin.label || [pin.city, pin.state].filter(Boolean).join(', ') || 'Service area'

// Number of map pins across a set of stations (primary + additional areas). With
// `state`, only pins in that state are counted (for the filtered station list).
export const locationCount = (stations, state) =>
  stations.reduce((n, s) => n + stationPins(s).filter((p) => !state || String(p.state || '').toUpperCase() === state).length, 0)

// "58 locations (55 stations)" — pins first (true service-coverage count), then the
// number of distinct station records in parentheses.
export function countLabel(stations, state) {
  const pins = locationCount(stations, state)
  const n = stations.length
  return `${pins} location${pins !== 1 ? 's' : ''} (${n} station${n !== 1 ? 's' : ''})`
}
