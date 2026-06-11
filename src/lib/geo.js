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

// Geocode a free-text address to {lat,lng,label} using OpenStreetMap Nominatim.
// No API key required. Subject to usage policy (1 req/sec) — fine for a single
// operator dispatching. Swap this for Google/Mapbox later by changing this fn only.
export async function geocodeAddress(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
    encodeURIComponent(query)
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en-US' },
  })
  if (!res.ok) throw new Error('Geocoding service error (' + res.status + ')')
  const data = await res.json()
  if (!data.length) throw new Error('No match found for that address.')
  const hit = data[0]
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    label: hit.display_name,
  }
}
