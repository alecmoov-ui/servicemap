// Shared geocoding via OpenStreetMap Nominatim (no key). Used by the geocode
// proxy route and the bulk importer. In-memory cache; swap provider here.

const cache = new Map()
const UA = { 'User-Agent': 'moov-servicemap/1.0', 'Accept-Language': 'en-US' }

// Postal codes: Nominatim is weak on full Canadian postal codes, so fall back to a
// structured postcode query and then Zippopotam (keyless; Canada at the 3-character
// forward-sortation-area level, US by ZIP). Mirrors src/lib/geocodeClient.js.
const CA_POSTAL = /\b([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)\b/
const US_ZIP = /\b(\d{5})(?:-\d{4})?\b/
export function parsePostal(q, country) {
  if (country === 'CA') {
    const m = String(q || '').match(CA_POSTAL)
    return m ? { full: `${m[1]} ${m[2]}`.toUpperCase(), area: m[1].toUpperCase(), raw: m[0] } : null
  }
  const m = String(q || '').match(US_ZIP)
  return m ? { full: m[1], area: m[1], raw: m[0] } : null
}

async function nominatimPostal(postal, cc) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${cc}&postalcode=${encodeURIComponent(postal)}`, { headers: UA })
  if (!r.ok) return null
  const data = await r.json()
  return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name } : null
}

async function zippopotam(area, country) {
  const r = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(area)}`, { headers: UA })
  if (!r.ok) return null
  const place = (await r.json())?.places?.[0]
  return place
    ? { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude), label: `${place['place name']}, ${place['state abbreviation'] || place.state} ${area} (postal area)` }
    : null
}

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
  const r = await fetch(url, { headers: UA })
  const data = r.ok ? await r.json() : []
  let out = data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name } : null
  if (!out) {
    const postal = parsePostal(q, country)
    if (postal) {
      try { out = await nominatimPostal(postal.full, cc) } catch { /* next */ }
      if (!out) { try { out = await zippopotam(postal.area, country) } catch { /* give up */ } }
    }
  }
  if (!out) return null
  cache.set(key, out)
  return out
}

export const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
