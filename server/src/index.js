import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

import { seedDatabase } from './seed.js'
import { authRouter } from './routes/auth.js'
import { stationsRouter } from './routes/stations.js'
import { dispatchesRouter } from './routes/dispatches.js'
import { respondRouter } from './routes/respond.js'
import { geocodeRouter } from './routes/geocode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

seedDatabase() // idempotent: seeds 37 stations + demo users on first run

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/stations', stationsRouter)
app.use('/api/dispatches', dispatchesRouter)
app.use('/api/respond', respondRouter)
app.use('/api/geocode', geocodeRouter)

// In production, serve the built client (vite build output at repo-root /dist).
const DIST = join(__dirname, '..', '..', 'dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
    res.sendFile(join(DIST, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Moov Service Network API on http://localhost:${PORT}`)
  if (existsSync(DIST)) console.log(`Serving built client from ${DIST}`)
})
