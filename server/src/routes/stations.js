import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdirSync, createReadStream, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import multer from 'multer'
import { db, rowToStation, stationToColumns, computePerfMap, rowToServiceEvent, rowToDocument, DOC_TYPES } from '../db.js'
import { requireAuth, requirePermission } from '../auth.js'
import { logFromReq } from '../activity.js'
import { computeCompliance } from '../compliance.js'
import { EXPORT_HEADER, stationToRow, readRows, rowToPatch } from '../importStations.js'
import { geocodeOne, sleep } from '../geocode.js'
import { createSnapshot } from '../snapshot.js'
import { randomUUID as uuid } from 'node:crypto'

export const stationsRouter = Router()
stationsRouter.use(requireAuth)

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '..', '..', 'data', 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 15 * 1024 * 1024 } }) // 15 MB

const getStation = (id) => db.prepare('SELECT * FROM stations WHERE id = ?').get(id)

// Build a station's API object with its derived performance + compliance attached.
function withDerived(row, perf) {
  const station = rowToStation(row, perf)
  const docTypes = new Set(
    db.prepare('SELECT doc_type FROM station_documents WHERE station_id = ?').all(row.id).map((d) => d.doc_type)
  )
  station.compliance = computeCompliance(station, docTypes)
  return station
}

// ---- Stations -------------------------------------------------------------

stationsRouter.get('/', (req, res) => {
  const perf = computePerfMap()
  // Batch document presence by station to avoid a query per row.
  const docMap = {}
  for (const d of db.prepare('SELECT station_id, doc_type FROM station_documents').all()) {
    ;(docMap[d.station_id] ||= new Set()).add(d.doc_type)
  }
  const rows = db.prepare('SELECT * FROM stations ORDER BY company').all()
  res.json(
    rows.map((r) => {
      const station = rowToStation(r, perf[r.id])
      station.compliance = computeCompliance(station, docMap[r.id] || new Set())
      return station
    })
  )
})

const csvEsc = (v) => {
  if (v === null || v === undefined) return ''
  const str = String(v)
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
}
const toCsv = (header, rows) =>
  [header.map(csvEsc).join(','), ...rows.map((r) => r.map(csvEsc).join(','))].join('\n')

// CSV export of every station — this file IS the import template (round-trip:
// export -> edit in Excel -> import).
stationsRouter.get('/export.csv', requirePermission('exportData'), (req, res) => {
  const perf = computePerfMap()
  const rows = db.prepare('SELECT * FROM stations ORDER BY company').all().map((r) => rowToStation(r, perf[r.id]))
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="moov-stations-${stamp}.csv"`)
  res.send(toCsv(EXPORT_HEADER, rows.map(stationToRow)))
})

// Blank template (headers only) for starting a fresh list.
stationsRouter.get('/import-template.csv', requirePermission('exportData'), (req, res) => {
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="moov-stations-template.csv"')
  res.send(toCsv(EXPORT_HEADER, []))
})

// ---- Bulk import (Excel/CSV) ----------------------------------------------

stationsRouter.get('/imports', requirePermission('addStations'), (req, res) => {
  const rows = db.prepare('SELECT * FROM station_imports ORDER BY id DESC LIMIT 100').all()
  res.json(
    rows.map((r) => ({
      id: r.id,
      originalName: r.original_name,
      created: r.created_count,
      updated: r.updated_count,
      errors: r.error_count,
      snapshot: r.snapshot_name,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
    }))
  )
})

stationsRouter.get('/imports/:id/download', requirePermission('addStations'), (req, res) => {
  const imp = db.prepare('SELECT * FROM station_imports WHERE id = ?').get(req.params.id)
  if (!imp) return res.status(404).json({ error: 'Import not found' })
  const path = join(UPLOAD_DIR, imp.filename)
  if (!existsSync(path)) return res.status(404).json({ error: 'File missing on disk' })
  res.setHeader('Content-Disposition', `attachment; filename="${imp.original_name || imp.filename}"`)
  createReadStream(path).pipe(res)
})

// Upload a station file: snapshot first, then upsert rows (match by ID, else by
// company name; blank ID = new). New/blank-coord rows are geocoded best-effort.
stationsRouter.post('/import', requirePermission('addStations'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  let snapshot = null
  try {
    snapshot = await createSnapshot('preimport')
  } catch (e) {
    /* non-fatal */
  }

  let parsed
  try {
    parsed = await readRows(readFileSync(req.file.path), req.file.originalname)
  } catch (e) {
    return res.status(400).json({ error: 'Could not read the file: ' + e.message })
  }

  const findByCompany = db.prepare('SELECT * FROM stations WHERE lower(company) = lower(?)')
  const result = { created: 0, updated: 0, errors: [], warnings: [], snapshot, total: parsed.rows.length }
  let geocodes = 0

  for (let i = 0; i < parsed.rows.length; i++) {
    const rowNum = i + 2 // header is row 1
    try {
      const { patch, products, id, company } = rowToPatch(parsed.rows[i])

      // Resolve target station.
      let existing = null
      if (id) existing = getStation(id)
      if (!existing && company) {
        const matches = findByCompany.all(company)
        if (matches.length > 1) {
          result.errors.push({ row: rowNum, message: `Ambiguous: ${matches.length} stations named "${company}". Add the ID column to target one.` })
          continue
        }
        existing = matches[0] || null
      }
      if (!existing && !company) {
        result.errors.push({ row: rowNum, message: 'Missing Company (and no matching ID) — cannot create.' })
        continue
      }

      // Merge products: present keys override; on update keep the rest.
      const baseProducts = existing ? JSON.parse(existing.products || '{}') : {}
      const mergedProducts = { ...baseProducts, ...products }
      const merged = { ...patch, products: mergedProducts }

      // Geocode if we still lack coordinates and have an address.
      let lat = merged.lat !== undefined ? merged.lat : existing?.lat
      let lng = merged.lng !== undefined ? merged.lng : existing?.lng
      if ((lat == null || lng == null) && geocodes < 60) {
        const q = [merged.serviceAddress ?? existing?.service_address, merged.city ?? existing?.city, merged.state ?? existing?.state]
          .filter(Boolean).join(', ')
        if (q) {
          geocodes++
          const geo = await geocodeOne(q)
          if (geo) {
            merged.lat = geo.lat
            merged.lng = geo.lng
            merged.geocodePrecision = 'address'
          } else {
            result.warnings.push({ row: rowNum, message: `Could not geocode "${q}" — imported without map location.` })
          }
          await sleep(1100) // Nominatim rate limit
        }
      }

      const cols = stationToColumns(merged)
      if (existing) {
        const keys = Object.keys(cols)
        if (keys.length) {
          db.prepare(`UPDATE stations SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
            .run({ id: existing.id, ...cols })
        }
        result.updated++
      } else {
        if (!cols.company) {
          result.errors.push({ row: rowNum, message: 'Missing Company — cannot create.' })
          continue
        }
        const newId = 'st_new_' + uuid().slice(0, 8)
        cols.id = newId
        cols.is_master = 0
        if (!cols.status) cols.status = 'active'
        if (!cols.geocode_precision) cols.geocode_precision = merged.geocodePrecision || 'address'
        const keys = Object.keys(cols)
        db.prepare(`INSERT INTO stations (${keys.join(', ')}) VALUES (${keys.map((k) => '@' + k).join(', ')})`).run(cols)
        result.created++
      }
    } catch (e) {
      result.errors.push({ row: rowNum, message: e.message })
    }
  }

  db.prepare(
    `INSERT INTO station_imports (filename, original_name, created_count, updated_count, error_count, snapshot_name, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.file.filename, req.file.originalname, result.created, result.updated, result.errors.length, snapshot, req.user.email)

  logFromReq(req, {
    action: 'station.import',
    entityType: 'station',
    summary: `Imported ${req.file.originalname}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
  })
  res.status(result.errors.length && !result.created && !result.updated ? 422 : 200).json(result)
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
  res.status(201).json(withDerived(getStation(id), computePerfMap()[id]))
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
  res.json(withDerived(getStation(req.params.id), computePerfMap()[req.params.id]))
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
  res.status(201).json(withDerived(getStation(req.params.id), computePerfMap()[req.params.id]))
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
