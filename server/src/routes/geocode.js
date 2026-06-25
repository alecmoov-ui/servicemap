// Server-side geocoding proxy (OpenStreetMap Nominatim). Proxying from the
// backend lets us set a proper User-Agent, cache results, and swap providers
// (Google/Mapbox) without touching the client.

import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { geocodeOne } from '../geocode.js'

export const geocodeRouter = Router()
geocodeRouter.use(requireAuth)

geocodeRouter.get('/', async (req, res) => {
  const q = (req.query.q || '').toString().trim()
  if (!q) return res.status(400).json({ error: 'Missing query' })
  try {
    const out = await geocodeOne(q)
    if (!out) return res.status(404).json({ error: 'No match found for that address.' })
    res.json(out)
  } catch (err) {
    res.status(502).json({ error: 'Geocoding failed: ' + err.message })
  }
})
