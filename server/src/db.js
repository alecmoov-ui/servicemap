// SQLite database: schema, connection, and row <-> API shape mapping.
// SQLite keeps the whole app a single file with zero setup. To move to Postgres
// later, replace this module (the rest of the server talks to the helpers below).

import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(process.env.DB_PATH || join(DATA_DIR, 'servicemap.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','dtm','dispatch')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stations (
  id                 TEXT PRIMARY KEY,
  company            TEXT NOT NULL,
  service_address    TEXT,
  city               TEXT,
  state              TEXT,
  lat                REAL,
  lng                REAL,
  geocode_precision  TEXT DEFAULT 'city',
  service_radius_mi  INTEGER DEFAULT 25,
  products           TEXT NOT NULL DEFAULT '{}',   -- JSON
  hvac_certification TEXT,
  proof_of_insurance TEXT,
  phone              TEXT,
  email              TEXT,
  billing_address    TEXT,
  service_type       TEXT,
  holds_inventory    TEXT,
  notes              TEXT,
  contract_on_file   INTEGER DEFAULT 0,
  contract_expiry    TEXT,
  insurance_expiry   TEXT,
  w9_on_file         INTEGER DEFAULT 0,
  after_hours        INTEGER DEFAULT 0,
  preferred_contact  TEXT DEFAULT 'email',
  status             TEXT NOT NULL DEFAULT 'active',
  dispatch_requests  INTEGER DEFAULT 0,
  dispatch_accepted  INTEGER DEFAULT 0,
  jobs_completed     INTEGER DEFAULT 0,
  is_master          INTEGER NOT NULL DEFAULT 0,   -- protected seed record
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispatches (
  id               TEXT PRIMARY KEY,
  station_id       TEXT NOT NULL REFERENCES stations(id),
  station_company  TEXT,
  station_state    TEXT,
  product          TEXT,
  distance_mi      REAL,
  issue            TEXT,
  consumer_name    TEXT,
  consumer_address TEXT,
  consumer_city    TEXT,
  status           TEXT NOT NULL DEFAULT 'requested',
  token_used       INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dispatch_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id TEXT NOT NULL REFERENCES dispatches(id),
  event       TEXT NOT NULL,
  note        TEXT,
  actor       TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

// ---- Row <-> API shape ----------------------------------------------------

export function rowToStation(r) {
  if (!r) return null
  return {
    id: r.id,
    company: r.company,
    serviceAddress: r.service_address,
    city: r.city,
    state: r.state,
    lat: r.lat,
    lng: r.lng,
    geocodePrecision: r.geocode_precision,
    serviceRadiusMi: r.service_radius_mi,
    products: JSON.parse(r.products || '{}'),
    hvacCertification: r.hvac_certification,
    proofOfInsurance: r.proof_of_insurance,
    phone: r.phone,
    email: r.email,
    billingAddress: r.billing_address,
    serviceType: r.service_type,
    holdsInventory: r.holds_inventory,
    notes: r.notes,
    contractOnFile: !!r.contract_on_file,
    contractExpiry: r.contract_expiry,
    insuranceExpiry: r.insurance_expiry,
    w9OnFile: !!r.w9_on_file,
    afterHours: !!r.after_hours,
    preferredContact: r.preferred_contact,
    status: r.status,
    isMaster: !!r.is_master,
    perf: {
      dispatchRequests: r.dispatch_requests,
      dispatchAccepted: r.dispatch_accepted,
      jobsCompleted: r.jobs_completed,
    },
  }
}

// Map an API-shaped station (partial) to DB columns for insert/update.
export function stationToColumns(s) {
  const c = {}
  const map = {
    company: 'company', serviceAddress: 'service_address', city: 'city', state: 'state',
    lat: 'lat', lng: 'lng', geocodePrecision: 'geocode_precision', serviceRadiusMi: 'service_radius_mi',
    hvacCertification: 'hvac_certification', proofOfInsurance: 'proof_of_insurance', phone: 'phone',
    email: 'email', billingAddress: 'billing_address', serviceType: 'service_type',
    holdsInventory: 'holds_inventory', notes: 'notes', contractExpiry: 'contract_expiry',
    insuranceExpiry: 'insurance_expiry', preferredContact: 'preferred_contact', status: 'status',
  }
  for (const [k, col] of Object.entries(map)) if (s[k] !== undefined) c[col] = s[k]
  if (s.products !== undefined) c.products = JSON.stringify(s.products)
  if (s.contractOnFile !== undefined) c.contract_on_file = s.contractOnFile ? 1 : 0
  if (s.w9OnFile !== undefined) c.w9_on_file = s.w9OnFile ? 1 : 0
  if (s.afterHours !== undefined) c.after_hours = s.afterHours ? 1 : 0
  if (s.perf) {
    if (s.perf.dispatchRequests !== undefined) c.dispatch_requests = s.perf.dispatchRequests
    if (s.perf.dispatchAccepted !== undefined) c.dispatch_accepted = s.perf.dispatchAccepted
    if (s.perf.jobsCompleted !== undefined) c.jobs_completed = s.perf.jobsCompleted
  }
  return c
}

export function rowToDispatch(r, events) {
  if (!r) return null
  return {
    id: r.id,
    stationId: r.station_id,
    stationCompany: r.station_company,
    stationState: r.station_state,
    product: r.product,
    distanceMi: r.distance_mi,
    issue: r.issue,
    consumer: { name: r.consumer_name, address: r.consumer_address, city: r.consumer_city },
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    timeline: (events || []).map((e) => ({ at: e.at, event: e.event, note: e.note, actor: e.actor })),
  }
}
