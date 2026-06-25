// Shared station column spec used by BOTH the CSV/Excel export and the bulk
// importer, so the exported file round-trips cleanly: export -> edit in Excel ->
// upload. Editable fields below; performance columns are export-only (derived).

import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'

// [ Header label, station field, type ]
export const FIELD_COLUMNS = [
  ['ID', 'id', 'string'],
  ['Company', 'company', 'string'],
  ['Service Address', 'serviceAddress', 'string'],
  ['City', 'city', 'string'],
  ['State', 'state', 'string'],
  ['Lat', 'lat', 'number'],
  ['Lng', 'lng', 'number'],
  ['Service Radius (mi)', 'serviceRadiusMi', 'int'],
  ['Status', 'status', 'string'],
  ['Tax ID/EIN', 'taxId', 'string'],
  ['Primary Contact', 'primaryContact', 'string'],
  ['Contact Title', 'primaryContactTitle', 'string'],
  ['Phone', 'phone', 'string'],
  ['Email', 'email', 'string'],
  ['Billing Address', 'billingAddress', 'string'],
  ['Shipping Address', 'shippingAddress', 'string'],
  ['Service Type', 'serviceType', 'string'],
  ['Holds Inventory', 'holdsInventory', 'string'],
  ['Parts Categories', 'partsCategories', 'list'],
  ['Total Technicians', 'totalTechnicians', 'int'],
  ['HVAC Cert', 'hvacCertification', 'string'],
  ['HVAC License', 'hvacLicense', 'string'],
  ['EPA608 Techs', 'epa608Techs', 'int'],
  ['EPA608 Level', 'epa608Level', 'string'],
  ['Insurance Carrier', 'insuranceCarrier', 'string'],
  ['GL Limits', 'glLimits', 'string'],
  ['Insurance Expiry', 'insuranceExpiry', 'string'],
  ['Proof of Insurance', 'proofOfInsurance', 'string'],
  ['Contract On File', 'contractOnFile', 'bool'],
  ['Contract Expiry', 'contractExpiry', 'string'],
  ['Effective Date', 'effectiveDate', 'string'],
  ['W9 On File', 'w9OnFile', 'bool'],
  ['After Hours', 'afterHours', 'bool'],
  ['Preferred Contact', 'preferredContact', 'string'],
  ['Notes', 'notes', 'string'],
]

// [ Header label, product key ]
export const PRODUCT_COLUMNS = [
  ['Product: Pumps', 'pumps'],
  ['Product: Salt Systems', 'saltSystems'],
  ['Product: Filters', 'filters'],
  ['Product: Lights', 'lights'],
  ['Product: Heat Pumps', 'heatPumps'],
  ['Product: Robotic Cleaners', 'roboticCleaners'],
]

// Export-only, ignored on import (derived from the service log).
export const PERF_COLUMNS = [
  ['Dispatch Requests', (s) => s.perf?.dispatchRequests],
  ['Dispatch Accepted', (s) => s.perf?.dispatchAccepted],
  ['Jobs Completed', (s) => s.perf?.jobsCompleted],
  ['Avg Completion Days', (s) => s.perf?.avgCompletionDays],
]

export const EXPORT_HEADER = [
  ...FIELD_COLUMNS.map((c) => c[0]),
  ...PRODUCT_COLUMNS.map((c) => c[0]),
  ...PERF_COLUMNS.map((c) => c[0]),
]

function cell(value) {
  if (value === null || value === undefined) return ''
  return value
}

// One export row (array aligned to EXPORT_HEADER).
export function stationToRow(s) {
  const fields = FIELD_COLUMNS.map(([, field]) => {
    if (field === 'partsCategories') return (s.partsCategories || []).join(', ')
    if (typeof s[field] === 'boolean') return s[field] ? 'yes' : 'no'
    return cell(s[field])
  })
  const products = PRODUCT_COLUMNS.map(([, key]) => (s.products?.[key] ? 'yes' : ''))
  const perf = PERF_COLUMNS.map(([, fn]) => cell(fn(s)))
  return [...fields, ...products, ...perf]
}

// ---- Import parsing -------------------------------------------------------

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// header (normalized) -> { kind:'field', field, type } | { kind:'product', key }
const HEADER_LOOKUP = (() => {
  const m = new Map()
  for (const [label, field, type] of FIELD_COLUMNS) {
    m.set(norm(label), { kind: 'field', field, type })
    m.set(norm(field), { kind: 'field', field, type })
  }
  for (const [label, key] of PRODUCT_COLUMNS) {
    m.set(norm(label), { kind: 'product', key })
    m.set(norm(key), { kind: 'product', key })
  }
  return m
})()

const truthy = (v) => ['yes', 'y', 'true', '1', 'x', '✓'].includes(String(v).trim().toLowerCase())

function coerce(type, raw) {
  const v = String(raw ?? '').trim()
  if (v === '') return type === 'bool' ? false : null
  if (type === 'number') return Number.isNaN(parseFloat(v)) ? null : parseFloat(v)
  if (type === 'int') return Number.isNaN(parseInt(v, 10)) ? null : parseInt(v, 10)
  if (type === 'bool') return truthy(v)
  if (type === 'list') return v.split(',').map((x) => x.trim()).filter(Boolean)
  return v
}

// Read an uploaded buffer (xlsx or csv) into rows of { header: value }.
export async function readRows(buffer, filename = '') {
  const isCsv = /\.csv$/i.test(filename)
  const wb = new ExcelJS.Workbook()
  if (isCsv) {
    await wb.csv.read(Readable.from(buffer))
  } else {
    await wb.xlsx.load(buffer)
  }
  const ws = wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }
  const headers = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, col) => {
    headers[col - 1] = c.value == null ? '' : String(c.value)
  })
  const rows = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const obj = {}
    let any = false
    headers.forEach((h, i) => {
      const val = row.getCell(i + 1).value
      const text = val && typeof val === 'object' && 'text' in val ? val.text : val // hyperlinks/rich text
      obj[h] = text == null ? '' : String(text)
      if (obj[h] !== '') any = true
    })
    if (any) rows.push(obj)
  }
  return { headers, rows }
}

// Turn a row object into a station patch. Only columns PRESENT in the file are
// included (so omitted columns are left untouched on update). Returns
// { patch, products, id, company } — products is a partial map of present keys.
export function rowToPatch(rowObj) {
  const patch = {}
  const products = {}
  let id = null
  let company = null
  for (const [header, raw] of Object.entries(rowObj)) {
    const def = HEADER_LOOKUP.get(norm(header))
    if (!def) continue
    if (def.kind === 'product') {
      products[def.key] = truthy(raw)
    } else if (def.field === 'id') {
      id = String(raw ?? '').trim() || null
    } else {
      const value = coerce(def.type, raw)
      patch[def.field] = value
      if (def.field === 'company') company = value
    }
  }
  return { patch, products, id, company }
}
