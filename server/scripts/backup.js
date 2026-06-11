// Online backup of the SQLite database to a timestamped file, with retention.
// Run manually:            npm run backup
// Or on a schedule (cron): e.g. daily   0 2 * * *  cd /app/server && npm run backup
//
// Code rollback (git) restores the CODE; THIS restores your DATA. Keep both.

import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'data', 'servicemap.db')
const BACKUP_DIR = process.env.BACKUP_DIR || join(__dirname, '..', 'data', 'backups')
const KEEP = Number(process.env.BACKUP_KEEP || 14)

mkdirSync(BACKUP_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dest = join(BACKUP_DIR, `servicemap-${stamp}.db`)

const db = new Database(DB_PATH)
await db.backup(dest) // safe online backup (handles WAL)
db.close()

// Retention: keep the most recent KEEP backups.
const files = readdirSync(BACKUP_DIR)
  .filter((f) => f.endsWith('.db'))
  .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
files.slice(KEEP).forEach((x) => unlinkSync(join(BACKUP_DIR, x.f)))

console.log(`Backup written: ${dest}  (keeping latest ${KEEP})`)
