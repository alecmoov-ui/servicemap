// Admin data-protection endpoints: create/list/download database snapshots.
// Snapshots are full SQLite backups: manual, automatic (daily + before every import
// and restore) and restorable in place from the Backups dialog.

import { Router } from 'express'
import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { requireAuth, requirePermission } from '../auth.js'
import { logFromReq } from '../activity.js'
import { createSnapshot, restoreSnapshot, BACKUP_DIR } from '../snapshot.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requirePermission('backups'))

function listSnapshots() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ name: f, size: statSync(join(BACKUP_DIR, f)).size, at: statSync(join(BACKUP_DIR, f)).mtime }))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
}

adminRouter.get('/snapshots', (req, res) => res.json(listSnapshots()))

adminRouter.post('/snapshot', async (req, res) => {
  const name = await createSnapshot()
  logFromReq(req, { action: 'data.snapshot', entityType: 'session', summary: `Created backup snapshot ${name}` })
  res.status(201).json({ name })
})

adminRouter.get('/snapshots/:name/download', (req, res) => {
  const safe = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '')
  const path = join(BACKUP_DIR, safe)
  if (!existsSync(path)) return res.status(404).json({ error: 'Snapshot not found' })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`)
  createReadStream(path).pipe(res)
})

// Roll station data back to a snapshot (a "prerestore" safety snapshot is taken first).
adminRouter.post('/snapshots/:name/restore', async (req, res) => {
  try {
    const result = await restoreSnapshot(req.params.name)
    logFromReq(req, { action: 'data.restore', entityType: 'session', summary: `Restored snapshot ${result.restored} (safety copy ${result.safety})` })
    res.json(result)
  } catch (e) {
    res.status(e.message === 'Snapshot not found' ? 404 : 400).json({ error: e.message })
  }
})
