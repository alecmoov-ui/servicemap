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
