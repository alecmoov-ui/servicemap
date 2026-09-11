// Recruiting helpers for the Zone Coverage page: turn uncovered / thinly covered
// metros into a prospecting worksheet. No external API — we hand the user ready-made
// Google searches per metro plus a CSV to track outreach (company, phone, email...).
import { PRODUCTS } from './ratings.js'

// Metros with 0 covering stations are gaps; exactly 1 is "thin" (single point of failure).
export const tierOf = (m) => (m.coveringCount === 0 ? 'gap' : m.coveringCount === 1 ? 'thin' : 'ok')

const g = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q)
const maps = (q) => 'https://www.google.com/maps/search/' + encodeURIComponent(q)

// Searches that surface repair-focused shops (not cleaning routes) and existing
// factory warranty stations, who already know the warranty workflow.
export function searchLinks(m) {
  const where = `${m.city}, ${m.state}`
  return [
    { label: 'Maps', href: maps(`pool equipment repair ${where}`) },
    { label: 'Repair', href: g(`pool pump heater repair company ${where}`) },
    { label: 'Warranty', href: g(`(Pentair OR Hayward OR Jandy) authorized warranty service ${where}`) },
  ]
}

const esc = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Worksheet rows: one per gap/thin metro, ranked by population, with blank
// outreach columns to fill in as you call/email prospects.
export function worksheetCsv(metros, productKey) {
  const head = [
    'Priority', 'Metro', 'State', 'Population (M)', 'Coverage', 'Stations covering',
    'Nearest station', 'Nearest (mi)', 'Missing products',
    'Google Maps search', 'Google repair search', 'Google warranty-station search',
    'Company', 'Website', 'Phone', 'Email', 'Contact', 'Status', 'Notes',
  ]
  const rows = metros
    .filter((m) => tierOf(m) !== 'ok')
    .sort((a, b) => (tierOf(a) === tierOf(b) ? b.pop - a.pop : tierOf(a) === 'gap' ? -1 : 1))
    .map((m, i) => {
      const [mapsL, repairL, warrantyL] = searchLinks(m)
      const missing =
        productKey === 'all'
          ? PRODUCTS.filter((p) => !m.coveringStations.some((s) => s.products?.[p.key])).map((p) => p.label)
          : [PRODUCTS.find((p) => p.key === productKey)?.label]
      return [
        i + 1, m.city, m.state, m.pop.toFixed(1), tierOf(m) === 'gap' ? 'Uncovered' : 'Thin (1 station)',
        m.coveringCount, m.nearestStation?.company ?? '', m.nearest === Infinity ? '' : Math.round(m.nearest),
        missing.join('; '), mapsL.href, repairL.href, warrantyL.href, '', '', '', '', '', '', '',
      ]
    })
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}

export function downloadText(filename, text, type = 'text/csv') {
  // BOM so Excel opens UTF-8 (en-dashes in metro names) correctly.
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
