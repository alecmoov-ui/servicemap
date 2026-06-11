// Builds the Express app (no listening) so it can be reused by the server entry
// point and by the test suite. Seeding is idempotent.

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
import { usersRouter } from './routes/users.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildApp({ seed = true } = {}) {
  if (seed) seedDatabase() // seeds 37 stations + demo users on first run

  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRouter)
  app.use('/api/stations', stationsRouter)
  app.use('/api/dispatches', dispatchesRouter)
  app.use('/api/respond', respondRouter)
  app.use('/api/geocode', geocodeRouter)
  app.use('/api/users', usersRouter)

  // In production, serve the built client (vite build output at repo-root /dist).
  const DIST = join(__dirname, '..', '..', 'dist')
  if (existsSync(DIST)) {
    app.use(express.static(DIST))
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
      res.sendFile(join(DIST, 'index.html'))
    })
  }

  return app
}
