// Regions + units (mirror of server/src/units.js). Radii are STORED in miles for
// every station; the Canadian region displays and enters kilometres.
export const REGIONS = [
  { key: 'US', label: 'US', flag: '🇺🇸', unit: 'mi', stateLabel: 'State', postalLabel: 'Zip code', home: { center: [39.5, -98.35], zoom: 4 } },
  { key: 'CA', label: 'Canada', flag: '🇨🇦', unit: 'km', stateLabel: 'Province', postalLabel: 'Postal code', home: { center: [60, -96], zoom: 3 } },
]
export const region = (key) => REGIONS.find((r) => r.key === key) || REGIONS[0]
export const KM_PER_MI = 1.609344
export const miToKm = (mi) => mi * KM_PER_MI
export const kmToMi = (km) => km / KM_PER_MI
export const unitFor = (key) => region(key).unit

// Display helpers — `mi` is always the stored mile value.
export const fmtDist = (mi, key) => (key === 'CA' ? `${miToKm(mi).toFixed(1)} km` : `${mi.toFixed(1)} mi`)
export const fmtRadius = (mi, key) => (mi == null ? '—' : key === 'CA' ? `${Math.round(miToKm(mi))} km` : `${Math.round(mi)} mi`)
// Numeric value for an input in the region's unit, and back to stored miles (1 dp).
export const displayRadius = (mi, key) => (mi === '' || mi == null ? '' : key === 'CA' ? Math.round(miToKm(Number(mi))) : Math.round(Number(mi)))
export const toMiles = (value, key) => {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return ''
  return Math.round((key === 'CA' ? kmToMi(n) : n) * 10) / 10
}
