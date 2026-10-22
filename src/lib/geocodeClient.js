// Address -> coordinates. Runs in the browser (the free OpenStreetMap service
// allows browser/residential IPs but rate-limits datacenter IPs like Render).
//
// Robustness: OSM often lacks exact house numbers for small towns, so we try the
// full address first, then progressively broaden (drop the house number, then
// street, falling back to city/state/zip). For a service RADIUS, town-level
// accuracy is perfectly fine — the operator can nudge the pin if needed.
import { api } from './api.js'

// Postal codes: OSM/Nominatim is weak on full Canadian postal codes (and bare US ZIPs
// in free text), so we also try a structured postcode lookup and, as a last resort,
// Zippopotam (GeoNames-backed, keyless): Canada at the forward-sortation-area level
// (first 3 characters), US by 5-digit ZIP. Area-level is fine for a service radius.
const CA_POSTAL = /\b([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)\b/
const US_ZIP = /\b(\d{5})(?:-\d{4})?\b/
export function parsePostal(q, country) {
  if (country === 'CA') {
    const m = q.match(CA_POSTAL)
    return m ? { full: `${m[1]} ${m[2]}`.toUpperCase(), area: m[1].toUpperCase(), raw: m[0] } : null
  }
  const m = q.match(US_ZIP)
  return m ? { full: m[1], area: m[1], raw: m[0] } : null
}

async function nominatimPostal(postal, country) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${country === 'CA' ? 'ca' : 'us'}&postalcode=` +
    encodeURIComponent(postal)
  const res = await fetch(url, { headers: { 'Accept-Language': 'en-US' } })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
}

async function zippopotam(area, country) {
  const res = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(area)}`)
  if (!res.ok) return null
  const data = await res.json()
  const place = data?.places?.[0]
  if (!place) return null
  return {
    lat: parseFloat(place.latitude), lng: parseFloat(place.longitude),
    label: `${place['place name']}, ${place['state abbreviation'] || place.state} ${area} (postal area)`,
  }
}

function candidates(query) {
  const q = query.trim()
  const list = [q]
  const noNum = q.replace(/^\s*#?\d+[a-zA-Z]?\s+/, '') // "412 2nd Ave, ..." -> "2nd Ave, ..."
  if (noNum && noNum !== q) list.push(noNum)
  const parts = q.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length > 1) list.push(parts.slice(1).join(', ')) // drop street -> city, state, zip
  if (parts.length > 2) list.push(parts.slice(-2).join(', ')) // state + zip / city + state
  return [...new Set(list.filter(Boolean))]
}

async function nominatim(q, country) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=${country === 'CA' ? 'ca' : 'us'}&q=` +
    encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'Accept-Language': 'en-US' } })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
}

// `country` ('US' | 'CA') restricts matches to that region's addresses.
export async function geocode(query, country = 'US') {
  let q = (query || '').trim()
  if (!q) throw new Error('Enter an address first.')
  const postal = parsePostal(q, country)
  // Normalise a Canadian postal code inside the query ("g1c8j6" -> "G1C 8J6").
  if (postal && country === 'CA') q = q.replace(postal.raw, postal.full)
  const postalOnly = postal && q.replace(postal.full, '').replace(/[,\s]+/g, '') === ''

  const tryPostal = async () => {
    if (!postal) return null
    try { const hit = await nominatimPostal(postal.full, country); if (hit) return { ...hit, approximate: true } } catch { /* next */ }
    try { const hit = await zippopotam(postal.area, country); if (hit) return { ...hit, approximate: true } } catch { /* next */ }
    return null
  }

  // A bare postal code: go straight to the postcode lookups.
  if (postalOnly) {
    const hit = await tryPostal()
    if (hit) return hit
  }

  // Try the browser first, broadening the query until something matches.
  for (const cand of candidates(q)) {
    try {
      const hit = await nominatim(cand, country)
      if (hit) return { ...hit, approximate: cand !== q }
    } catch {
      /* try next candidate */
    }
  }

  // Street address not in OSM but it carried a postal code: locate by the code.
  if (!postalOnly) {
    const hit = await tryPostal()
    if (hit) return hit
  }

  // Last resort: the server proxy (keyed provider, if configured).
  try {
    return await api.geocode(q, country)
  } catch {
    const where = country === 'CA' ? 'Canada' : 'the US'
    throw new Error(postal
      ? `Could not find that address or postal code in ${where}. Check the region switch, try "City, ${country === 'CA' ? 'Province' : 'ST'}", or enter lat/lng manually.`
      : `Could not find that address in ${where}. Add the ${country === 'CA' ? 'postal' : 'ZIP'} code, check the region switch, or enter lat/lng manually.`)
  }
}
