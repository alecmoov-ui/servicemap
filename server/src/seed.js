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
  { email: 'sales@moovpool.com', name: 'Sales', role: 'sales' },
]

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
    // Seed the station roster only — NO demo performance data. Analytics start empty
    // and fill in as the team logs real service events from resolved Zendesk tickets.
    const seedAll = db.transaction((rows) => rows.forEach(insertStation))
    seedAll(stations)
    console.log(`Seeded ${stations.length} master stations (no demo analytics).`)
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
