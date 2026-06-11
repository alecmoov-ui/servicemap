import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db, rowToStation } from '../db.js'
import { requireAuth, requirePermission } from '../auth.js'
import { listDispatches, getDispatch, advance } from '../dispatchService.js'
import { buildDispatchEmail, sendEmail } from '../email.js'
import { logFromReq } from '../activity.js'

export const dispatchesRouter = Router()
dispatchesRouter.use(requireAuth)

dispatchesRouter.get('/', (req, res) => {
  res.json(listDispatches())
})

// Create a dispatch, log it, and send (or compose) the request email.
dispatchesRouter.post('/', requirePermission('dispatch'), async (req, res) => {
  const b = req.body || {}
  const stationRow = db.prepare('SELECT * FROM stations WHERE id = ?').get(b.stationId)
  if (!stationRow) return res.status(400).json({ error: 'Unknown station' })
  const station = rowToStation(stationRow)

  const id = 'dsp_' + randomUUID().slice(0, 8)
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO dispatches
       (id, station_id, station_company, station_state, product, distance_mi, issue,
        consumer_name, consumer_address, consumer_city, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`
    ).run(
      id, station.id, station.company, station.state, b.product, b.distanceMi ?? null,
      b.issue || null, b.consumer?.name || null, b.consumer?.address || null,
      b.consumer?.city || null, req.user.email
    )
    db.prepare('INSERT INTO dispatch_events (dispatch_id, event, actor) VALUES (?, ?, ?)')
      .run(id, 'requested', req.user.email)
    db.prepare('UPDATE stations SET dispatch_requests = dispatch_requests + 1 WHERE id = ?').run(station.id)
  })
  create()

  const dispatch = getDispatch(id)
  const sender = { email: req.user.email, name: req.user.name }
  const email = buildDispatchEmail({ dispatch, station, appUrl: req.headers.origin, sender })
  const result = await sendEmail(email)

  logFromReq(req, {
    action: 'dispatch.create',
    entityType: 'dispatch',
    entityId: id,
    summary: `Dispatched ${dispatch.product} to ${station.company} (${result.mode}${result.sent ? ', sent' : ''}) for ${dispatch.consumer?.address || 'end user'}`,
  })
  res.status(201).json({ dispatch, email, delivery: result })
})

// Internal status advance (dispatcher acting on behalf, e.g. phone confirmation).
dispatchesRouter.post('/:id/events', requirePermission('dispatch'), (req, res) => {
  const { status, note } = req.body || {}
  const updated = advance(req.params.id, status, note, req.user.email)
  if (!updated) return res.status(404).json({ error: 'Dispatch not found' })
  logFromReq(req, {
    action: 'dispatch.advance',
    entityType: 'dispatch',
    entityId: req.params.id,
    summary: `Marked ${req.params.id} ${status}${note ? ` — ${note}` : ''}`,
  })
  res.json(updated)
})
