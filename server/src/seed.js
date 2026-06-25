// Seeds the database with the 37 master stations, demo users, and demo service-log
// entries (so analytics is populated). Idempotent: only seeds empty tables unless
// run with --force.
//   node src/seed.js            (seed if empty)
//   node src/seed.js --force    (wipe & reseed)

import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { db, stationToColumns } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_FILE = join(__dirname, '..', '..', 'src', 'data', 'stations.seed.json')

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'moov1234'
const DEMO_USERS = [
  { email: 'admin@moovpool.com', name: 'Network Admin', role: 'admin' },
  { email: 'dtm@moovpool.com', name: 'Territory Manager', role: 'dtm' },
  { email: 'dispatch@moovpool.com', name: 'Dispatcher', role: 'dispatch' },
]

const PRODUCT_LABEL = {
  pumps: 'Pump', filters: 'Filter', saltSystems: 'Salt System',
  roboticCleaners: 'Cleaner', lights: 'Light',
  heatPumpElectrical: 'Heat Pump – Electrical', heatPumpRefrigerant: 'Heat Pump – Refrigerant',
}

export function seedDatabase({ force = false } = {}) {
  if (force) {
    db.exec('DELETE FROM service_events; DELETE FROM station_documents; DELETE FROM activity_log; DELETE FROM stations; DELETE FROM users;')
  }

  if (db.prepare('SELECT COUNT(*) n FROM stations').get().n === 0) {
    const stations = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
    const insertStation = (s) => {
      const cols = stationToColumns(s)
      cols.id = s.id
      cols.is_master = 1
      const keys = Object.keys(cols)
      db.prepare(`INSERT INTO stations (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`).run(cols)
    }
    const insertEvent = db.prepare(
      `INSERT INTO service_events (station_id, zendesk_ticket, product, event_date, accepted, completed, completion_days, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'seed')`
    )
    let ticket = 10000
    const seedAll = db.transaction((rows) => {
      for (const s of rows) {
        insertStation(s)
        // Turn the demo perf counts into individual service-log entries.
        const perf = s.perf || {}
        const requests = perf.dispatchRequests || 0
        const accepted = perf.dispatchAccepted || 0
        const completed = perf.jobsCompleted || 0
        const product = Object.keys(PRODUCT_LABEL).find((k) => s.products?.[k])
        for (let i = 0; i < requests; i++) {
          const isAccepted = i < accepted ? 1 : 0
          const isCompleted = i < completed ? 1 : 0
          const daysAgo = 5 + Math.floor((i * 47 + s.id.length * 13) % 175)
          const date = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10)
          const dur = isCompleted ? 1 + ((i * 3 + 2) % 9) : null
          insertEvent.run(s.id, 'Z' + ++ticket, PRODUCT_LABEL[product] || 'Pump', date, isAccepted, isCompleted, dur)
        }
      }
    })
    seedAll(stations)
    console.log(`Seeded ${stations.length} master stations + demo service log.`)
  }

  if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
    const insert = db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
    const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
    for (const u of DEMO_USERS) insert.run(u.email, u.name, u.role, hash)
    console.log('Seeded demo users (password: %s):', DEMO_PASSWORD)
    DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.email}`))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase({ force: process.argv.includes('--force') })
  console.log('Done.')
}
