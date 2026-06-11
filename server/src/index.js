import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { buildApp } from './app.js'

const PORT = process.env.PORT || 3001
const app = buildApp()

app.listen(PORT, () => {
  console.log(`Moov Service Network API on http://localhost:${PORT}`)
  const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
  if (existsSync(DIST)) console.log(`Serving built client from ${DIST}`)
})
