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

export function stationPins(s) {
  const primary = { key: s.id + ':0', label: '', address: s.serviceAddress, city: s.city, state: s.state, lat: s.lat, lng: s.lng, radiusMi: s.serviceRadiusMi || 25, primary: true }
  const extra = (s.serviceAreas || []).map((a, i) => ({ key: `${s.id}:${i + 1}`, ...a, radiusMi: a.radiusMi || 25, primary: false }))
  return [primary, ...extra].filter(hasCoords)
}

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
    if (d <= pin.radiusMi && (!best || d < best.distanceMi)) best = { pin, distanceMi: d }
  }
  return best
}

// Short label for a pin: "Naples branch" / "Naples, FL".
export const pinLabel = (pin) => pin.label || [pin.city, pin.state].filter(Boolean).join(', ') || 'Service area'
