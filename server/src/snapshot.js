// Creates a full SQLite snapshot (save-point) of the live database. Used by the
// admin Backups endpoint and automatically before every bulk import.

import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { db } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const BACKUP_DIR = process.env.BACKUP_DIR || join(__dirname, '..', 'data', 'backups')

export async function createSnapshot(tag = '') {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `servicemap-${tag ? tag + '-' : ''}${stamp}.db`
  await db.backup(join(BACKUP_DIR, name))
  return name
}

// Tables that hold station DATA. Users and the activity log are deliberately left
// alone by a restore (nobody gets locked out; the restore itself stays audited).
const DATA_TABLES = ['stations', 'service_events', 'station_documents', 'station_imports']

// Roll the station data back to a snapshot, in place, without a restart:
//  1. take a safety snapshot of the current state ("prerestore"),
//  2. ATTACH the snapshot and copy each data table over inside one transaction
//     (only columns both schemas share, so an older snapshot still restores).
export async function restoreSnapshot(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '')
  const path = join(BACKUP_DIR, safe)
  if (!safe.endsWith('.db') || !existsSync(path)) throw new Error('Snapshot not found')
  // Validate it is a servicemap database before touching anything.
  const probe = new Database(path, { readonly: true })
  const hasStations = probe.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stations'").get()
  probe.close()
  if (!hasStations) throw new Error('That file is not a Service Network snapshot')

  const safety = await createSnapshot('prerestore')
  db.exec(`ATTACH DATABASE '${path.replace(/'/g, "''")}' AS snap`)
  try {
    db.pragma('foreign_keys = OFF')
    db.transaction(() => {
      for (const t of [...DATA_TABLES].reverse()) db.exec(`DELETE FROM ${t}`)
      for (const t of DATA_TABLES) {
        const inSnap = db.prepare(`SELECT 1 FROM snap.sqlite_master WHERE type = 'table' AND name = ?`).get(t)
        if (!inSnap) continue
        const live = new Set(db.prepare(`PRAGMA main.table_info(${t})`).all().map((c) => c.name))
        const cols = db.prepare(`PRAGMA snap.table_info(${t})`).all().map((c) => c.name).filter((c) => live.has(c))
        if (!cols.length) continue
        const list = cols.join(', ')
        db.exec(`INSERT INTO main.${t} (${list}) SELECT ${list} FROM snap.${t}`)
      }
    })()
  } finally {
    db.pragma('foreign_keys = ON')
    db.exec('DETACH DATABASE snap')
  }
  const counts = Object.fromEntries(DATA_TABLES.map((t) => [t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]))
  return { restored: safe, safety, counts }
}

// Automatic save-points: one per day (tagged "auto"), keeping the most recent KEEP.
export const AUTO_KEEP = Number(process.env.AUTO_SNAPSHOT_KEEP || 30)
export function listAutoSnapshots() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('servicemap-auto-') && f.endsWith('.db'))
    .map((f) => ({ name: f, at: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
}
export async function autoSnapshot({ minAgeMs = 20 * 60 * 60 * 1000 } = {}) {
  const latest = listAutoSnapshots()[0]
  if (latest && Date.now() - latest.at < minAgeMs) return null // already have one for today
  const name = await createSnapshot('auto')
  for (const old of listAutoSnapshots().slice(AUTO_KEEP)) unlinkSync(join(BACKUP_DIR, old.name))
  return name
}
