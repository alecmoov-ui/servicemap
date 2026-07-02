// Builds the Express app (no listening) so it can be reused by the server entry
// point and by the test suite. Seeding is idempotent.

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

import { seedDatabase } from './seed.js'
import { authRouter } from './routes/auth.js'
import { stationsRouter } from './routes/stations.js'
import { geocodeRouter } from './routes/geocode.js'
import { usersRouter } from './routes/users.js'
import { activityRouter } from './routes/activity.js'
import { adminRouter } from './routes/admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function buildApp({ seed = true } = {}) {
  if (seed) seedDatabase() // seeds 37 stations + demo users + demo service log on first run

  const app = express()
  app.set('trust proxy', 1) // behind Render/other proxies — needed for correct client IPs
  // Security headers. CSP is disabled because the map loads OpenStreetMap tiles and
  // geocoding cross-origin; the app is login-gated and served same-origin otherwise.
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors())
  app.use(express.json())

  // Throttle sign-in attempts (brute-force protection). Skipped in tests.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
    message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
  })

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/auth/login', loginLimiter)
  app.use('/api/auth', authRouter)
  app.use('/api/stations', stationsRouter)
  app.use('/api/geocode', geocodeRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/activity', activityRouter)
  app.use('/api/admin', adminRouter)

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
