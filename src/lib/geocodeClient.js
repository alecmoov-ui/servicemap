// Address -> coordinates. Runs in the browser (the free OpenStreetMap service
// allows browser/residential IPs but rate-limits datacenter IPs like Render).
//
// Robustness: OSM often lacks exact house numbers for small towns, so we try the
// full address first, then progressively broaden (drop the house number, then
// street, falling back to city/state/zip). For a service RADIUS, town-level
// accuracy is perfectly fine — the operator can nudge the pin if needed.
import { api } from './api.js'

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

async function nominatim(q) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
    encodeURIComponent(q)
  const res = await fetch(url, { headers: { 'Accept-Language': 'en-US' } })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
}

export async function geocode(query) {
  const q = (query || '').trim()
  if (!q) throw new Error('Enter an address first.')

  // Try the browser first, broadening the query until something matches.
  for (const cand of candidates(q)) {
    try {
      const hit = await nominatim(cand)
      if (hit) return { ...hit, approximate: cand !== q }
    } catch {
      /* try next candidate */
    }
  }

  // Last resort: the server proxy (keyed provider, if configured).
  try {
    return await api.geocode(q)
  } catch {
    throw new Error('Could not find that address. Add the ZIP code, or enter lat/lng manually.')
  }
}
