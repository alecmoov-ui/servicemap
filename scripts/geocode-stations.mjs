// One-time refinement: turn the city-center seed coordinates into pinpoint,
// street-level coordinates by geocoding each station's full service address.
//
// Run once (needs internet):   npm run geocode
//
// It rewrites src/data/stations.seed.json in place, setting lat/lng and
// geocodePrecision: "address" for every station it can resolve. Stations that
// already have address-level precision are skipped, so it's safe to re-run after
// adding new ones. Uses OpenStreetMap Nominatim (free, no key) and respects its
// 1 request/second usage policy.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED = join(__dirname, '..', 'src', 'data', 'stations.seed.json')
const UA = 'moov-servicemap-geocoder/1.0 (warranty service network tool)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
    encodeURIComponent(query)
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' } })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

const stations = JSON.parse(await readFile(SEED, 'utf8'))
let updated = 0,
  failed = 0,
  skipped = 0

for (const s of stations) {
  if (s.geocodePrecision === 'address') {
    skipped++
    continue
  }
  const query = s.serviceAddress || `${s.city}, ${s.state}`
  try {
    const hit = await geocode(query)
    if (hit) {
      s.lat = Math.round(hit.lat * 1e6) / 1e6
      s.lng = Math.round(hit.lng * 1e6) / 1e6
      s.geocodePrecision = 'address'
      updated++
      console.log(`✓ ${s.company.padEnd(38)} ${s.lat}, ${s.lng}`)
    } else {
      failed++
      console.warn(`✗ ${s.company} — no match for "${query}" (kept city-center)`)
    }
  } catch (err) {
    failed++
    console.warn(`✗ ${s.company} — ${err.message} (kept city-center)`)
  }
  await sleep(1100) // Nominatim: max 1 req/sec
}

await writeFile(SEED, JSON.stringify(stations, null, 2) + '\n')
console.log(`\nDone. ${updated} refined, ${skipped} already precise, ${failed} failed.`)
