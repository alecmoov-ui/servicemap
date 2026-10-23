// Text formatting shared by the profile, call card and lists.

// One clean address line from parts that may overlap (people often type the full
// address into the street field): split on commas, trim, drop blanks and repeats,
// drop a province/state code when its full name is already present, postal code last.
const REGION_NAMES = {
  AB: 'alberta', BC: 'british columbia', MB: 'manitoba', NB: 'new brunswick', NL: 'newfoundland and labrador', NS: 'nova scotia',
  NT: 'northwest territories', NU: 'nunavut', ON: 'ontario', PE: 'prince edward island', QC: 'quebec', SK: 'saskatchewan', YT: 'yukon',
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware',
  FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky',
  LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri',
  MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york',
  NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island',
  SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington',
  WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
}
const POSTAL = /^(?:[A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}(?:-\d{4})?)$/i
const TRAILING_POSTAL = /^(.*?)\s+((?:[A-Z]\d[A-Z]\s?\d[A-Z]\d)|\d{5}(?:-\d{4})?)$/i
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function formatAddress(...parts) {
  const seen = new Set()
  const out = []
  // "FL 33186" / "ON K7A 4S7" inside one piece -> state and postal code as separate pieces.
  const pieces = parts.flatMap((v) => String(v || '').split(',')).flatMap((piece) => {
    const m = piece.trim().match(TRAILING_POSTAL)
    return m ? [m[1], m[2]] : [piece]
  })
  for (const part of pieces) {
    const t = part.trim().replace(/\s+/g, ' ')
    const k = fold(t)
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  const names = new Set(out.map(fold))
  const kept = out.filter((t) => !(t.length === 2 && REGION_NAMES[t.toUpperCase()] && names.has(REGION_NAMES[t.toUpperCase()])))
  const postal = kept.filter((t) => POSTAL.test(t))
  const rest = kept.filter((t) => !POSTAL.test(t))
  // Re-attach the postal code to a trailing state/province code: "…, Miami, FL 33186".
  if (postal.length && rest.length && rest[rest.length - 1].length === 2) return [...rest.slice(0, -1), `${rest[rest.length - 1]} ${postal[0]}`].join(', ')
  return [...rest, ...postal].join(', ')
}

// Plain-text "call card" for dispatching: everything you need to reach the station,
// ready to paste into Zendesk. Blank fields are left out.
export function callCard(s) {
  const lines = [s.company]
  const contact = [s.primaryContact, s.primaryContactTitle && `(${s.primaryContactTitle})`].filter(Boolean).join(' ')
  if (contact) lines.push(`Contact: ${contact}`)
  if (s.phone) lines.push(`Phone: ${s.phone}`)
  if (s.email) lines.push(`Email: ${s.email}`)
  for (const c of s.contacts || []) {
    const who = [c.name, c.title && `(${c.title})`].filter(Boolean).join(' ')
    const how = [c.phone, c.email].filter(Boolean).join(' · ')
    if (who || how) lines.push(`${who || 'Contact'}: ${how || '—'}`)
  }
  const addr = formatAddress(s.serviceAddress, s.city, s.state, s.zip)
  if (addr) lines.push(`Address: ${addr}`)
  return lines.join('\n')
}
