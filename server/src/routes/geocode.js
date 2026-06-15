// Server-side geocoding proxy (OpenStreetMap Nominatim). Proxying from the
// backend lets us set a proper User-Agent, cache results, and swap providers
// (Google/Mapbox) without touching the client.

import { Router } from 'express'
import { requireAuth } from '../auth.js'

export const geocodeRouter = Router()
geocodeRouter.use(requireAuth)

const cache = new Map()

geocodeRouter.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim()
  if (!q) return res.status(400).json({ error: 'Missing query' })
  if (cache.has(q)) return res.json(cache.get(q))

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
      encodeURIComponent(q)
    const r = await fetch(url, {
      headers: { 'User-Agent': 'moov-servicemap/1.0', 'Accept-Language': 'en-US' },
    })
    if (!r.ok) return res.status(502).json({ error: 'Geocoding service error' })
    const data = await r.json()
    if (!data.length) return res.status(404).json({ error: 'No match found for that address.' })
    const out = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name }
    cache.set(q, out)
    res.json(out)
  } catch (err) {
    res.status(502).json({ error: 'Geocoding failed: ' + err.message })
  }
})
