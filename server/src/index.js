import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { buildApp } from './app.js'
import { autoSnapshot } from './snapshot.js'

const PORT = process.env.PORT || 3001
const app = buildApp()

app.listen(PORT, () => {
  console.log(`Moov Service Network API on http://localhost:${PORT}`)
  const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
  if (existsSync(DIST)) console.log(`Serving built client from ${DIST}`)
})

// Automatic daily save-point (restorable from Stations -> Backups). Runs shortly after
// boot if today's is missing, then every 6h (no-op until ~20h have passed).
const runAuto = () => autoSnapshot().then((n) => n && console.log(`Auto snapshot ${n}`)).catch((e) => console.error('Auto snapshot failed:', e.message))
setTimeout(runAuto, 30 * 1000)
setInterval(runAuto, 6 * 60 * 60 * 1000)
