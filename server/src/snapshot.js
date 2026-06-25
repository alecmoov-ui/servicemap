// Creates a full SQLite snapshot (save-point) of the live database. Used by the
// admin Backups endpoint and automatically before every bulk import.

import { mkdirSync } from 'node:fs'
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
