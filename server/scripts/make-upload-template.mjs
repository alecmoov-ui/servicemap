// Generates the station upload workbook from the SAME column spec the importer
// uses, so it always round-trips. Pre-fills the current seed roster (with IDs) and
// adds an example lead row + a Field Guide sheet.
//   node scripts/make-upload-template.mjs [outputPath.xlsx]

import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FIELD_COLUMNS, CONTACT_COLUMNS, PRODUCT_COLUMNS } from '../src/importStations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] || join(__dirname, '..', '..', 'Moov-Stations-Upload-Template.xlsx')
const seed = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'data', 'stations.seed.json'), 'utf8'))

const HEADER = [
  ...FIELD_COLUMNS.map((c) => c[0]),
  ...CONTACT_COLUMNS.map((c) => c.label),
  ...PRODUCT_COLUMNS.map((c) => c[0]),
]

function rowFor(s) {
  const fields = FIELD_COLUMNS.map(([, field]) => {
    if (field === 'partsCategories') return (s.partsCategories || []).join(', ')
    const v = s[field]
    if (typeof v === 'boolean') return v ? 'yes' : 'no'
    return v == null ? '' : v
  })
  const contacts = CONTACT_COLUMNS.map((c) => s.contacts?.[c.idx]?.[c.field] || '')
  const products = PRODUCT_COLUMNS.map(([, key]) => (s.products?.[key] ? 'yes' : ''))
  return [...fields, ...contacts, ...products]
}

const wb = new ExcelJS.Workbook()

// --- Sheet 1: Stations (imported sheet) ---
const ws = wb.addWorksheet('Stations', { views: [{ state: 'frozen', ySplit: 1 }] })
ws.addRow(HEADER)
ws.getRow(1).font = { bold: true }
ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FE' } }

// Example lead rows (clearly marked) showing common scenarios. ID is blank = new.
// Real cities so they geocode on import; delete or edit before going live.
const examples = [
  {
    // Electrical-only pool company (no HVAC license needed).
    company: 'EXAMPLE — Sunshine Pool Repair (delete)',
    serviceAddress: '5600 S Orange Ave, Orlando, FL 32809',
    city: 'Orlando', state: 'FL', zip: '32809', serviceRadiusMi: 30, status: 'prospect',
    primaryContact: 'Maria Lopez', primaryContactTitle: 'Owner',
    phone: '407-555-0142', email: 'maria@sunshinepoolrepair.com',
    serviceType: 'On the road', holdsInventory: 'No', totalTechnicians: 3,
    preferredContact: 'phone', notes: 'Lead from distributor referral; vetting in progress',
    products: { pumps: true, filters: true, saltSystems: true, heatPumpElectrical: true },
  },
  {
    // HVAC-licensed company that does refrigerant heat-pump work.
    company: 'EXAMPLE — Desert HVAC & Pools (delete)',
    serviceAddress: '2120 W Camelback Rd, Phoenix, AZ 85015',
    city: 'Phoenix', state: 'AZ', zip: '85015', serviceRadiusMi: 45, status: 'prospect',
    primaryContact: 'Sam Carter', primaryContactTitle: 'Service Manager',
    phone: '602-555-0190', email: 'sam@deserthvacpools.com',
    serviceType: 'Both (fixed + road)', holdsInventory: 'Yes', totalTechnicians: 8,
    hvacLicense: 'AZ-ROC-998877 (AZ)', epa608Techs: 4, epa608Level: 'Universal',
    insuranceCarrier: 'Acme Mutual', glLimits: '$1M / $2M', insuranceExpiry: '2027-03-31',
    preferredContact: 'email',
    contacts: [
      { name: 'Rosa Kim', title: 'Dispatch', phone: '602-555-0191', email: 'dispatch@deserthvacpools.com' },
      { name: 'Tom Reyes', title: 'Billing', phone: '602-555-0192', email: 'billing@deserthvacpools.com' },
    ],
    products: { pumps: true, filters: true, heatPumpElectrical: true, heatPumpRefrigerant: true },
  },
  {
    // Single-product specialist.
    company: 'EXAMPLE — Gulf Coast Pump Co (delete)',
    serviceAddress: '4100 W Kennedy Blvd, Tampa, FL 33609',
    city: 'Tampa', state: 'FL', zip: '33609', serviceRadiusMi: 20, status: 'prospect',
    primaryContact: 'Dee Nguyen', phone: '813-555-0173', email: 'dee@gulfcoastpump.com',
    serviceType: 'On the road', holdsInventory: 'No', totalTechnicians: 2,
    products: { pumps: true },
  },
]
examples.forEach((ex) => {
  const r = ws.addRow(rowFor(ex))
  r.font = { italic: true, color: { argb: 'FF8A5A1A' } }
})

// The current roster (with IDs).
seed.forEach((s) => ws.addRow(rowFor(s)))

ws.columns.forEach((col, i) => {
  const header = HEADER[i] || ''
  col.width = Math.min(Math.max(header.length + 2, 12), 28)
})

// --- Sheet 2: Field Guide ---
const guide = wb.addWorksheet('Field Guide')
const G = [
  ['HOW TO USE THIS FILE', '', '', ''],
  ['• One row per station location. Edit existing rows or add new ones at the bottom.', '', '', ''],
  ['• ID column: LEAVE BLANK for a new station/lead. KEEP the value to update an existing one. Never change an existing ID.', '', '', ''],
  ['• Lat (auto) / Lng (auto): leave blank — the app fills them from the address on upload.', '', '', ''],
  ['• Performance (dispatch/accept/complete) is NOT entered here — it comes from the in-app Service Log.', '', '', ''],
  ['• Only the columns present in the file are updated. Keep using this full file so nothing is unintentionally blanked.', '', '', ''],
  ['• Save as .xlsx or .csv, then in the app: Stations → Import file.', '', '', ''],
  ['', '', '', ''],
  ['Column', 'Required?', 'What to enter', 'Accepted values / example'],
  ['ID', 'No (blank = new)', 'System ID for an existing station', 'st_01 (leave blank to create)'],
  ['Company', 'YES', 'Legal business name (also used to match if ID is blank)', 'Aqua Mechanic'],
  ['Service Address', 'Recommended', 'Street they dispatch from', '4760 N. Wind Blvd, Kissimmee, FL 34746'],
  ['City', 'Recommended', 'City', 'Kissimmee'],
  ['State', 'Recommended', '2-letter state', 'FL'],
  ['Zip', 'Recommended', 'ZIP code (improves auto-location accuracy)', '34746'],
  ['Service Radius (miles)', 'YES', 'Coverage radius in miles', '15, 25, 60'],
  ['Status', 'YES', 'Lifecycle (leads = prospect; prospects are hidden from Map/Coverage)', 'active | paused | prospect'],
  ['Tax ID/EIN', 'No', 'Tax ID', '12-3456789'],
  ['Primary Contact', 'No', 'Main contact name', 'Jane Doe'],
  ['Contact Title', 'No', 'Their title', 'Owner'],
  ['Contact 2 Name / Title / Phone / Email', 'No', 'A second person to address (e.g. dispatch)', 'Rosa Kim / Dispatch / 602-555-0191 / rosa@...'],
  ['Contact 3 Name / Title / Phone / Email', 'No', 'A third person (e.g. billing). Add more in the app.', 'Tom Reyes / Billing / ...'],
  ['Phone', 'No', 'Phone', '555-123-4567'],
  ['Email', 'No', 'Email', 'jane@example.com'],
  ['Billing Address', 'No', 'Billing address', '...'],
  ['Shipping Address', 'No', 'Shipping address', '...'],
  ['Service Type', 'No', 'How they work', 'On the road | Both (fixed + road) | Fixed location'],
  ['Holds Inventory', 'No', 'Stocks Moov parts?', 'Yes | No'],
  ['Parts Categories', 'No', 'Which parts they stock (comma-separated)', 'pumps, filters'],
  ['Total Technicians', 'No', 'Headcount', '5'],
  ['HVAC Cert', 'No', 'Free-text note', 'On file'],
  ['HVAC License', 'For refrigerant', 'License # + issuing state (required for refrigerant HP work)', 'FL-CAC1234 (FL)'],
  ['EPA608 Techs', 'No', '# of EPA 608-certified techs', '2'],
  ['EPA608 Level', 'No', 'Highest level on staff', 'Type I | Type II | Type III | Universal'],
  ['Insurance Carrier', 'No', 'Carrier name', 'Acme Insurance'],
  ['GL Limits', 'No', 'General liability limits', '$1M / $2M'],
  ['Insurance Expiry', 'No', 'Policy expiry (ISO date)', '2026-12-31'],
  ['Proof of Insurance', 'No', 'Free-text note', 'On file'],
  ['Contract On File', 'No', 'Signed contract on file?', 'yes | no'],
  ['Contract Expiry', 'No', 'Contract end (ISO date)', '2027-01-15'],
  ['Effective Date', 'No', 'Agreement start (ISO date)', '2026-01-15'],
  ['W9 On File', 'No', 'W-9 received?', 'yes | no'],
  ['After Hours', 'No', 'Available after hours?', 'yes | no'],
  ['Preferred Contact', 'No', 'Best way to reach them', 'email | phone'],
  ['Notes', 'No', 'Anything else', 'free text'],
  ['Product: Pumps', 'Per product', 'Qualified for this product?', 'yes (blank = no)'],
  ['Product: Salt Systems', 'Per product', '', 'yes'],
  ['Product: Filters', 'Per product', '', 'yes'],
  ['Product: Lights', 'Per product', '', 'yes'],
  ['Product: Robotic Cleaners', 'Per product', '', 'yes'],
  ['Product: Heat Pump - Electrical', 'Per product', 'Electrical heat-pump fixes (no HVAC license needed)', 'yes'],
  ['Product: Heat Pump - Refrigerant', 'Per product', 'Refrigerant work (requires HVAC license + EPA 608)', 'yes'],
  ['Lat (auto)', 'No', 'Auto-filled from address — leave blank', '(blank)'],
  ['Lng (auto)', 'No', 'Auto-filled from address — leave blank', '(blank)'],
]
G.forEach((r) => guide.addRow(r))
guide.getRow(1).font = { bold: true, size: 13 }
guide.getRow(9).font = { bold: true }
guide.columns = [{ width: 32 }, { width: 16 }, { width: 52 }, { width: 46 }]

await wb.xlsx.writeFile(out)
console.log('Wrote', out)
