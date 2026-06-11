import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db, rowToStation, stationToColumns } from '../db.js'
import { requireAuth, requirePermission } from '../auth.js'

export const stationsRouter = Router()
stationsRouter.use(requireAuth)

stationsRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM stations ORDER BY company').all()
  res.json(rows.map(rowToStation))
})

stationsRouter.post('/', requirePermission('addStations'), (req, res) => {
  const s = req.body || {}
  if (!s.company) return res.status(400).json({ error: 'Company is required' })
  const id = 'st_new_' + randomUUID().slice(0, 8)
  const cols = stationToColumns({ status: 'active', geocodePrecision: 'address', ...s })
  const keys = Object.keys(cols)
  db.prepare(
    `INSERT INTO stations (id, is_master${keys.length ? ', ' + keys.join(', ') : ''})
     VALUES (@id, 0${keys.length ? ', ' + keys.map((k) => '@' + k).join(', ') : ''})`
  ).run({ id, ...cols })
  res.status(201).json(rowToStation(db.prepare('SELECT * FROM stations WHERE id = ?').get(id)))
})

stationsRouter.put('/:id', requirePermission('editStations'), (req, res) => {
  const existing = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Station not found' })
  const cols = stationToColumns(req.body || {})
  const keys = Object.keys(cols)
  if (keys.length) {
    db.prepare(
      `UPDATE stations SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`
    ).run({ id: req.params.id, ...cols })
  }
  res.json(rowToStation(db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id)))
})

// Master records are protected: only non-master stations can be deleted, admin only.
stationsRouter.delete('/:id', requirePermission('manageUsers'), (req, res) => {
  const s = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id)
  if (!s) return res.status(404).json({ error: 'Station not found' })
  if (s.is_master) return res.status(403).json({ error: 'Master records cannot be deleted; set status to "paused" instead.' })
  db.prepare('DELETE FROM stations WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})
