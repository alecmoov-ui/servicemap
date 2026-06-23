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
  -- Schedule A: business identity
  tax_id             TEXT,
  primary_contact    TEXT,
  primary_contact_title TEXT,
  phone              TEXT,
  email              TEXT,
  billing_address    TEXT,
  shipping_address   TEXT,
  -- Schedule A: heat-pump / HVAC
  hvac_certification TEXT,
  hvac_license       TEXT,
  epa608_techs       INTEGER,
  epa608_level       TEXT,
  -- Schedule A: insurance
  proof_of_insurance TEXT,
  insurance_carrier  TEXT,
  gl_limits          TEXT,
  insurance_expiry   TEXT,
  -- Schedule A: parts & capacity
  holds_inventory    TEXT,
  parts_categories   TEXT,                          -- JSON array
  total_technicians  INTEGER,
  -- agreement / compliance
  service_type       TEXT,
  contract_on_file   INTEGER DEFAULT 0,
  contract_expiry    TEXT,
  effective_date     TEXT,
  w9_on_file         INTEGER DEFAULT 0,
  after_hours        INTEGER DEFAULT 0,
  preferred_contact  TEXT DEFAULT 'email',
  status             TEXT NOT NULL DEFAULT 'active',
  notes              TEXT,
  is_master          INTEGER NOT NULL DEFAULT 0,    -- protected seed record
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual performance log: one row per resolved Zendesk service ticket.
-- Station performance + analytics are DERIVED from these rows.
CREATE TABLE IF NOT EXISTS service_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id      TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  zendesk_ticket  TEXT,
  product         TEXT,
  event_date      TEXT,
  accepted        INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0,
  completion_days REAL,
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_se_station ON service_events (station_id);

-- Uploaded documents (contract, HVAC license, insurance, Schedule A).
CREATE TABLE IF NOT EXISTS station_documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id    TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL,
  filename      TEXT NOT NULL,    -- stored filename on disk
  original_name TEXT,
  mime          TEXT,
  size          INTEGER,
  uploaded_by   TEXT,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doc_station ON station_documents (station_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  summary     TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_log (at DESC);
`)

// Lightweight migrations: add columns to existing databases without recreating
// tables (SQLite has no full migration system here). Safe to run every startup.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
ensureColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0')

export const DOC_TYPES = ['contract', 'hvac_license', 'insurance', 'schedule_a']

// ---- Row <-> API shape ----------------------------------------------------

const ZERO_PERF = { dispatchRequests: 0, dispatchAccepted: 0, jobsCompleted: 0, avgCompletionDays: null }

export function rowToStation(r, perf) {
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
    taxId: r.tax_id,
    primaryContact: r.primary_contact,
    primaryContactTitle: r.primary_contact_title,
    phone: r.phone,
    email: r.email,
    billingAddress: r.billing_address,
    shippingAddress: r.shipping_address,
    hvacCertification: r.hvac_certification,
    hvacLicense: r.hvac_license,
    epa608Techs: r.epa608_techs,
    epa608Level: r.epa608_level,
    proofOfInsurance: r.proof_of_insurance,
    insuranceCarrier: r.insurance_carrier,
    glLimits: r.gl_limits,
    insuranceExpiry: r.insurance_expiry,
    holdsInventory: r.holds_inventory,
    partsCategories: JSON.parse(r.parts_categories || '[]'),
    totalTechnicians: r.total_technicians,
    serviceType: r.service_type,
    contractOnFile: !!r.contract_on_file,
    contractExpiry: r.contract_expiry,
    effectiveDate: r.effective_date,
    w9OnFile: !!r.w9_on_file,
    afterHours: !!r.after_hours,
    preferredContact: r.preferred_contact,
    status: r.status,
    notes: r.notes,
    isMaster: !!r.is_master,
    perf: perf || ZERO_PERF,
  }
}

// Map an API-shaped station (partial) to DB columns for insert/update.
export function stationToColumns(s) {
  const c = {}
  const map = {
    company: 'company', serviceAddress: 'service_address', city: 'city', state: 'state',
    lat: 'lat', lng: 'lng', geocodePrecision: 'geocode_precision', serviceRadiusMi: 'service_radius_mi',
    taxId: 'tax_id', primaryContact: 'primary_contact', primaryContactTitle: 'primary_contact_title',
    phone: 'phone', email: 'email', billingAddress: 'billing_address', shippingAddress: 'shipping_address',
    hvacCertification: 'hvac_certification', hvacLicense: 'hvac_license', epa608Techs: 'epa608_techs',
    epa608Level: 'epa608_level', proofOfInsurance: 'proof_of_insurance', insuranceCarrier: 'insurance_carrier',
    glLimits: 'gl_limits', insuranceExpiry: 'insurance_expiry', holdsInventory: 'holds_inventory',
    totalTechnicians: 'total_technicians', serviceType: 'service_type', contractExpiry: 'contract_expiry',
    effectiveDate: 'effective_date', preferredContact: 'preferred_contact', status: 'status', notes: 'notes',
  }
  for (const [k, col] of Object.entries(map)) if (s[k] !== undefined) c[col] = s[k]
  if (s.products !== undefined) c.products = JSON.stringify(s.products)
  if (s.partsCategories !== undefined) c.parts_categories = JSON.stringify(s.partsCategories)
  if (s.contractOnFile !== undefined) c.contract_on_file = s.contractOnFile ? 1 : 0
  if (s.w9OnFile !== undefined) c.w9_on_file = s.w9OnFile ? 1 : 0
  if (s.afterHours !== undefined) c.after_hours = s.afterHours ? 1 : 0
  return c
}

// Aggregate station performance from the service log. Returns a map keyed by id.
export function computePerfMap() {
  const rows = db
    .prepare(
      `SELECT station_id,
              COUNT(*) AS requests,
              SUM(accepted) AS accepted,
              SUM(completed) AS completed,
              AVG(CASE WHEN completed = 1 THEN completion_days END) AS avg_days
       FROM service_events GROUP BY station_id`
    )
    .all()
  const map = {}
  for (const r of rows) {
    map[r.station_id] = {
      dispatchRequests: r.requests,
      dispatchAccepted: r.accepted || 0,
      jobsCompleted: r.completed || 0,
      avgCompletionDays: r.avg_days != null ? Math.round(r.avg_days * 10) / 10 : null,
    }
  }
  return map
}

export function rowToServiceEvent(r) {
  return {
    id: r.id,
    stationId: r.station_id,
    zendeskTicket: r.zendesk_ticket,
    product: r.product,
    eventDate: r.event_date,
    accepted: !!r.accepted,
    completed: !!r.completed,
    completionDays: r.completion_days,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export function rowToDocument(r) {
  return {
    id: r.id,
    stationId: r.station_id,
    docType: r.doc_type,
    originalName: r.original_name,
    mime: r.mime,
    size: r.size,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
  }
}

export function rowToActivity(r) {
  return {
    id: r.id, at: r.at, actor: r.actor, actorName: r.actor_name,
    action: r.action, entityType: r.entity_type, entityId: r.entity_id, summary: r.summary,
  }
}
