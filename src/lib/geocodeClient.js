// Address -> coordinates. We try the browser FIRST (uses the user's own IP, which
// the free OpenStreetMap service allows) and fall back to the server proxy. This
// avoids the datacenter-IP rate-limiting that blocks server-side lookups on hosts
// like Render. For heavy/production use, add a keyed provider on the server.
import { api } from './api.js'

export async function geocode(query) {
  const q = (query || '').trim()
  if (!q) throw new Error('Enter an address first.')

  // 1) Directly from the browser.
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=0&q=' +
      encodeURIComponent(q)
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-US' } })
    if (res.ok) {
      const data = await res.json()
      if (data.length) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
      }
    }
  } catch {
    /* fall through to the server */
  }

  // 2) Server proxy fallback.
  return api.geocode(q)
}
