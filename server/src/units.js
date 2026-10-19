// Regions + units. Radii are STORED in miles for every station (all geometry stays
// in one unit); the Canadian division sees and enters kilometres at the edges
// (UI, CSV). Mirrored on the client in src/lib/units.js.
export const COUNTRIES = ['US', 'CA']
export const KM_PER_MI = 1.609344
export const miToKm = (mi) => mi * KM_PER_MI
export const kmToMi = (km) => km / KM_PER_MI
export const unitFor = (country) => (country === 'CA' ? 'km' : 'mi')

// 'canada' / 'ca' / 'can' -> 'CA'; everything else (incl. blank) -> 'US'.
export function normalizeCountry(v) {
  const s = String(v || '').trim().toLowerCase()
  return ['ca', 'can', 'canada'].includes(s) ? 'CA' : 'US'
}
// Radii keep one decimal so km <-> miles round-trips cleanly (30 km = 18.6 mi).
export const roundMi = (mi) => Math.round(Number(mi) * 10) / 10
