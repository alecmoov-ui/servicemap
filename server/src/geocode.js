// Shared geocoding via OpenStreetMap Nominatim (no key). Used by the geocode
// proxy route and the bulk importer. In-memory cache; swap provider here.

const cache = new Map()

// `country` ('US' | 'CA') restricts results to that region's addresses.
export async function geocodeOne(query, country = 'US') {
  const q = (query || '').trim()
  if (!q) return null
  const cc = country === 'CA' ? 'ca' : 'us'
  const key = cc + ':' + q
  if (cache.has(key)) return cache.get(key)
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${cc}&q=` +
    encodeURIComponent(q)
  const r = await fetch(url, { headers: { 'User-Agent': 'moov-servicemap/1.0', 'Accept-Language': 'en-US' } })
  if (!r.ok) return null
  const data = await r.json()
  if (!data.length) return null
  const out = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
  cache.set(key, out)
  return out
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
