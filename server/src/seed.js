// Seeds the database with the 37 master stations and demo users.
// Idempotent: only seeds empty tables unless run with --force.
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

export function seedDatabase({ force = false } = {}) {
  if (force) {
    db.exec('DELETE FROM dispatch_events; DELETE FROM dispatches; DELETE FROM stations; DELETE FROM users;')
  }

  const stationCount = db.prepare('SELECT COUNT(*) n FROM stations').get().n
  if (stationCount === 0) {
    const stations = JSON.parse(readFileSync(SEED_FILE, 'utf8'))
    const insert = db.prepare(`INSERT INTO stations
      (id, company, service_address, city, state, lat, lng, geocode_precision, service_radius_mi,
       products, hvac_certification, proof_of_insurance, phone, email, billing_address, service_type,
       holds_inventory, notes, contract_on_file, contract_expiry, insurance_expiry, w9_on_file,
       after_hours, preferred_contact, status, dispatch_requests, dispatch_accepted, jobs_completed, is_master)
      VALUES (@id, @company, @service_address, @city, @state, @lat, @lng, @geocode_precision,
       @service_radius_mi, @products, @hvac_certification, @proof_of_insurance, @phone, @email,
       @billing_address, @service_type, @holds_inventory, @notes, @contract_on_file, @contract_expiry,
       @insurance_expiry, @w9_on_file, @after_hours, @preferred_contact, @status,
       @dispatch_requests, @dispatch_accepted, @jobs_completed, 1)`)
    const tx = db.transaction((rows) => {
      for (const s of rows) {
        const c = stationToColumns(s)
        insert.run({
          id: s.id,
          company: c.company ?? s.company,
          service_address: c.service_address ?? null,
          city: c.city ?? null, state: c.state ?? null,
          lat: c.lat ?? null, lng: c.lng ?? null,
          geocode_precision: c.geocode_precision ?? 'city',
          service_radius_mi: c.service_radius_mi ?? 25,
          products: c.products ?? '{}',
          hvac_certification: c.hvac_certification ?? null,
          proof_of_insurance: c.proof_of_insurance ?? null,
          phone: c.phone ?? null, email: c.email ?? null,
          billing_address: c.billing_address ?? null,
          service_type: c.service_type ?? null,
          holds_inventory: c.holds_inventory ?? null,
          notes: c.notes ?? null,
          contract_on_file: c.contract_on_file ?? 0,
          contract_expiry: c.contract_expiry ?? null,
          insurance_expiry: c.insurance_expiry ?? null,
          w9_on_file: c.w9_on_file ?? 0,
          after_hours: c.after_hours ?? 0,
          preferred_contact: c.preferred_contact ?? 'email',
          status: c.status ?? 'active',
          dispatch_requests: c.dispatch_requests ?? 0,
          dispatch_accepted: c.dispatch_accepted ?? 0,
          jobs_completed: c.jobs_completed ?? 0,
        })
      }
    })
    tx(stations)
    console.log(`Seeded ${stations.length} master stations.`)
  }

  const userCount = db.prepare('SELECT COUNT(*) n FROM users').get().n
  if (userCount === 0) {
    const insert = db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
    const hash = bcrypt.hashSync(DEMO_PASSWORD, 10)
    for (const u of DEMO_USERS) insert.run(u.email, u.name, u.role, hash)
    console.log('Seeded demo users (password: %s):', DEMO_PASSWORD)
    DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.email}`))
  }
}

// Run directly?
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase({ force: process.argv.includes('--force') })
  console.log('Done.')
}
