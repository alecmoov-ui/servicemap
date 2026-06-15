import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdirSync, createReadStream, unlinkSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import multer from 'multer'
import { db, rowToStation, stationToColumns, computePerfMap, rowToServiceEvent, rowToDocument, DOC_TYPES } from '../db.js'
import { requireAuth, requirePermission } from '../auth.js'
import { logFromReq } from '../activity.js'

export const stationsRouter = Router()
stationsRouter.use(requireAuth)

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '..', '..', 'data', 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 15 * 1024 * 1024 } }) // 15 MB

const getStation = (id) => db.prepare('SELECT * FROM stations WHERE id = ?').get(id)

// ---- Stations -------------------------------------------------------------

stationsRouter.get('/', (req, res) => {
  const perf = computePerfMap()
  const rows = db.prepare('SELECT * FROM stations ORDER BY company').all()
  res.json(rows.map((r) => rowToStation(r, perf[r.id])))
})

// CSV export of every station + key fields (data backup / Excel).
stationsRouter.get('/export.csv', requirePermission('exportData'), (req, res) => {
  const perf = computePerfMap()
  const rows = db.prepare('SELECT * FROM stations ORDER BY company').all().map((r) => rowToStation(r, perf[r.id]))
  const cols = [
    ['Company', 'company'], ['Service Address', 'serviceAddress'], ['City', 'city'], ['State', 'state'],
    ['Lat', 'lat'], ['Lng', 'lng'], ['Service Radius (mi)', 'serviceRadiusMi'], ['Status', 'status'],
    ['Tax ID/EIN', 'taxId'], ['Primary Contact', 'primaryContact'], ['Contact Title', 'primaryContactTitle'],
    ['Phone', 'phone'], ['Email', 'email'], ['Billing Address', 'billingAddress'], ['Shipping Address', 'shippingAddress'],
    ['Service Type', 'serviceType'], ['Holds Inventory', 'holdsInventory'], ['Total Technicians', 'totalTechnicians'],
    ['HVAC Cert', 'hvacCertification'], ['HVAC License', 'hvacLicense'], ['EPA608 Techs', 'epa608Techs'], ['EPA608 Level', 'epa608Level'],
    ['Insurance Carrier', 'insuranceCarrier'], ['GL Limits', 'glLimits'], ['Insurance Expiry', 'insuranceExpiry'], ['Proof of Insurance', 'proofOfInsurance'],
    ['Contract On File', 'contractOnFile'], ['Contract Expiry', 'contractExpiry'], ['Effective Date', 'effectiveDate'], ['W9 On File', 'w9OnFile'],
    ['Dispatch Requests', (s) => s.perf.dispatchRequests], ['Dispatch Accepted', (s) => s.perf.dispatchAccepted],
    ['Jobs Completed', (s) => s.perf.jobsCompleted], ['Avg Completion Days', (s) => s.perf.avgCompletionDays],
    ['Notes', 'notes'],
  ]
  const products = ['pumps', 'saltSystems', 'filters', 'lights', 'heatPumps', 'roboticCleaners']
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const str = String(v)
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
  }
  const header = [...cols.map((c) => c[0]), ...products.map((p) => 'Product: ' + p)]
  const lines = [header.join(',')]
  for (const s of rows) {
    const base = cols.map(([, key]) => esc(typeof key === 'function' ? key(s) : s[key]))
    const prod = products.map((p) => (s.products?.[p] ? 'yes' : ''))
    lines.push([...base, ...prod].join(','))
  }
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="moov-stations-${stamp}.csv"`)
  res.send(lines.join('\n'))
})

stationsRouter.post('/', requirePermission('addStations'), (req, res) => {
  const s = req.body || {}
  if (!s.company) return res.status(400).json({ error: 'Company is required' })
  const id = 'st_new_' + randomUUID().slice(0, 8)
  const cols = stationToColumns({ status: 'active', geocodePrecision: 'address', ...s })
  cols.id = id
  cols.is_master = 0
  const keys = Object.keys(cols)
  db.prepare(`INSERT INTO stations (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`).run(cols)
  logFromReq(req, { action: 'station.create', entityType: 'station', entityId: id, summary: `Added station ${s.company}` })
  res.status(201).json(rowToStation(getStation(id), computePerfMap()[id]))
})

stationsRouter.put('/:id', requirePermission('editStations'), (req, res) => {
  const existing = getStation(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Station not found' })
  const cols = stationToColumns(req.body || {})
  const keys = Object.keys(cols)
  if (keys.length) {
    db.prepare(`UPDATE stations SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
      .run({ id: req.params.id, ...cols })
  }
  logFromReq(req, { action: 'station.update', entityType: 'station', entityId: req.params.id, summary: `Edited station ${existing.company}` })
  res.json(rowToStation(getStation(req.params.id), computePerfMap()[req.params.id]))
})

// Master records are protected: only non-master stations can be deleted, admin only.
stationsRouter.delete('/:id', requirePermission('manageUsers'), (req, res) => {
  const s = getStation(req.params.id)
  if (!s) return res.status(404).json({ error: 'Station not found' })
  if (s.is_master) return res.status(403).json({ error: 'Master records cannot be deleted; set status to "paused" instead.' })
  db.prepare('DELETE FROM stations WHERE id = ?').run(req.params.id)
  logFromReq(req, { action: 'station.delete', entityType: 'station', entityId: req.params.id, summary: `Deleted station ${s.company}` })
  res.json({ ok: true })
})

// ---- Service log (manual performance entry) -------------------------------

stationsRouter.get('/:id/service-events', (req, res) => {
  const rows = db.prepare('SELECT * FROM service_events WHERE station_id = ? ORDER BY event_date DESC, id DESC').all(req.params.id)
  res.json(rows.map(rowToServiceEvent))
})

stationsRouter.post('/:id/service-events', requirePermission('logService'), (req, res) => {
  if (!getStation(req.params.id)) return res.status(404).json({ error: 'Station not found' })
  const b = req.body || {}
  const accepted = b.accepted ? 1 : 0
  const completed = b.completed ? 1 : 0
  db.prepare(
    `INSERT INTO service_events (station_id, zendesk_ticket, product, event_date, accepted, completed, completion_days, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.params.id, b.zendeskTicket || null, b.product || null,
    b.eventDate || new Date().toISOString().slice(0, 10),
    accepted, completed,
    completed && b.completionDays != null ? Number(b.completionDays) : null,
    b.notes || null, req.user.email
  )
  logFromReq(req, {
    action: 'service.log', entityType: 'station', entityId: req.params.id,
    summary: `Logged service event${b.zendeskTicket ? ' (Zendesk ' + b.zendeskTicket + ')' : ''}: ${accepted ? 'accepted' : 'declined'}${completed ? ', completed' : ''}`,
  })
  res.status(201).json(rowToStation(getStation(req.params.id), computePerfMap()[req.params.id]))
})

stationsRouter.delete('/:id/service-events/:eventId', requirePermission('logService'), (req, res) => {
  db.prepare('DELETE FROM service_events WHERE id = ? AND station_id = ?').run(req.params.eventId, req.params.id)
  logFromReq(req, { action: 'service.delete', entityType: 'station', entityId: req.params.id, summary: `Removed a service-log entry` })
  res.json({ ok: true })
})

// ---- Documents ------------------------------------------------------------

stationsRouter.get('/:id/documents', (req, res) => {
  const rows = db.prepare('SELECT * FROM station_documents WHERE station_id = ? ORDER BY doc_type, id').all(req.params.id)
  res.json(rows.map(rowToDocument))
})

stationsRouter.post('/:id/documents', requirePermission('editStations'), upload.single('file'), (req, res) => {
  if (!getStation(req.params.id)) return res.status(404).json({ error: 'Station not found' })
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const docType = req.body.docType
  if (!DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'Invalid document type' })
  // One document per type per station: replace any existing.
  const prev = db.prepare('SELECT * FROM station_documents WHERE station_id = ? AND doc_type = ?').all(req.params.id, docType)
  prev.forEach((p) => { try { unlinkSync(join(UPLOAD_DIR, p.filename)) } catch {} })
  db.prepare('DELETE FROM station_documents WHERE station_id = ? AND doc_type = ?').run(req.params.id, docType)

  db.prepare(
    `INSERT INTO station_documents (station_id, doc_type, filename, original_name, mime, size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, docType, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.email)
  logFromReq(req, { action: 'document.upload', entityType: 'station', entityId: req.params.id, summary: `Uploaded ${docType.replace('_', ' ')}: ${req.file.originalname}` })
  res.status(201).json({ ok: true })
})

stationsRouter.get('/:id/documents/:docId/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM station_documents WHERE id = ? AND station_id = ?').get(req.params.docId, req.params.id)
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  const path = join(UPLOAD_DIR, doc.filename)
  if (!existsSync(path)) return res.status(404).json({ error: 'File missing on disk' })
  res.setHeader('Content-Type', doc.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name || doc.filename}"`)
  createReadStream(path).pipe(res)
})

stationsRouter.delete('/:id/documents/:docId', requirePermission('editStations'), (req, res) => {
  const doc = db.prepare('SELECT * FROM station_documents WHERE id = ? AND station_id = ?').get(req.params.docId, req.params.id)
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  try { unlinkSync(join(UPLOAD_DIR, doc.filename)) } catch {}
  db.prepare('DELETE FROM station_documents WHERE id = ?').run(req.params.docId)
  logFromReq(req, { action: 'document.delete', entityType: 'station', entityId: req.params.id, summary: `Removed ${doc.doc_type.replace('_', ' ')}` })
  res.json({ ok: true })
})
