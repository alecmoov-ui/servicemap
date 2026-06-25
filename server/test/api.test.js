// Integration tests — the safety net. Exercise auth, role enforcement,
// master-record protection, the service log (manual analytics) and derived
// performance, CSV export, and user management. Run with `npm test`.
// Each run uses a fresh temp database, so tests never touch real data.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let server, base, tmpDir

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'moov-test-'))
  process.env.DB_PATH = join(tmpDir, 'test.db')
  process.env.UPLOAD_DIR = join(tmpDir, 'uploads')
  process.env.BACKUP_DIR = join(tmpDir, 'backups')
  process.env.JWT_SECRET = 'test-secret'
  const { buildApp } = await import('../src/app.js')
  const app = buildApp()
  await new Promise((resolve) => {
    server = app.listen(0, resolve)
  })
  base = `http://localhost:${server.address().port}`
})

after(() => {
  server?.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  let data = null
  try {
    data = await res.json()
  } catch {}
  return { status: res.status, data }
}
async function tokenFor(email) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password: 'moov1234' } })
  return r.data.token
}

test('health check', async () => {
  const r = await api('/api/health')
  assert.equal(r.status, 200)
  assert.equal(r.data.ok, true)
})

test('login: valid credentials return a token; invalid are rejected', async () => {
  const ok = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@moovpool.com', password: 'moov1234' } })
  assert.equal(ok.status, 200)
  assert.ok(ok.data.token)
  assert.equal(ok.data.user.role, 'admin')
  const bad = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@moovpool.com', password: 'wrong' } })
  assert.equal(bad.status, 401)
})

test('stations require auth, seed 37 master records, and carry derived perf', async () => {
  assert.equal((await api('/api/stations')).status, 401)
  const token = await tokenFor('admin@moovpool.com')
  const r = await api('/api/stations', { token })
  assert.equal(r.status, 200)
  assert.equal(r.data.length, 37)
  assert.ok(r.data.every((s) => s.isMaster === true))
  // Perf is derived from the seeded service log.
  assert.ok(r.data.every((s) => typeof s.perf.dispatchRequests === 'number'))
})

test('role enforcement: dispatch cannot add stations, admin can', async () => {
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api('/api/stations', { method: 'POST', token: dispatchToken, body: { company: 'Nope' } })).status, 403)
  const adminToken = await tokenFor('admin@moovpool.com')
  const created = await api('/api/stations', {
    method: 'POST', token: adminToken,
    body: { company: 'Test Pools', city: 'Denver', state: 'CO', lat: 39.7, lng: -105, products: { pumps: true } },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.isMaster, false)
})

test('master records cannot be deleted; non-master can', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  assert.equal((await api('/api/stations/st_01', { method: 'DELETE', token: adminToken })).status, 403)
  const created = await api('/api/stations', { method: 'POST', token: adminToken, body: { company: 'Temp Co', city: 'X', state: 'TX' } })
  assert.equal((await api(`/api/stations/${created.data.id}`, { method: 'DELETE', token: adminToken })).status, 200)
})

test('service log: any role can log; performance is recomputed', async () => {
  const token = await tokenFor('dispatch@moovpool.com')
  const before = (await api('/api/stations', { token })).data.find((s) => s.id === 'st_02').perf

  const updated = await api('/api/stations/st_02/service-events', {
    method: 'POST', token,
    body: { zendeskTicket: 'Z99001', product: 'Pump', accepted: true, completed: true, completionDays: 3, eventDate: '2026-06-01' },
  })
  assert.equal(updated.status, 201)
  assert.equal(updated.data.perf.dispatchRequests, before.dispatchRequests + 1)
  assert.equal(updated.data.perf.dispatchAccepted, before.dispatchAccepted + 1)
  assert.equal(updated.data.perf.jobsCompleted, before.jobsCompleted + 1)
  assert.ok(updated.data.perf.avgCompletionDays > 0)

  const events = await api('/api/stations/st_02/service-events', { token })
  assert.ok(events.data.some((e) => e.zendeskTicket === 'Z99001'))
})

test('CSV export: allowed for admin/dtm, denied for dispatch', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const res = await fetch(base + '/api/stations/export.csv', { headers: { Authorization: `Bearer ${adminToken}` } })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /csv/)
  const text = await res.text()
  assert.match(text, /Company,Service Address/)

  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const denied = await fetch(base + '/api/stations/export.csv', { headers: { Authorization: `Bearer ${dispatchToken}` } })
  assert.equal(denied.status, 403)
})

test('user management: admin only; cannot delete the last admin', async () => {
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api('/api/users', { token: dispatchToken })).status, 403)
  const adminToken = await tokenFor('admin@moovpool.com')
  const list = await api('/api/users', { token: adminToken })
  assert.ok(list.data.length >= 3)
  const adminId = list.data.find((u) => u.role === 'admin').id
  assert.equal((await api(`/api/users/${adminId}`, { method: 'DELETE', token: adminToken })).status, 400)
})

test('compliance: flags expired insurance, heat-pump w/o license, and clears when OK', async () => {
  const token = await tokenFor('admin@moovpool.com')

  // Expired insurance -> level 'expired'
  const expired = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Lapsed Insurance Co', city: 'X', state: 'TX', insuranceExpiry: '2020-01-01', products: { pumps: true } },
  })
  assert.equal(expired.data.compliance.level, 'expired')
  assert.ok(expired.data.compliance.issues.some((i) => /Insurance expired/.test(i.message)))

  // Heat-pump qualified but no HVAC license -> 'warn'
  const hp = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'No License HVAC', city: 'Y', state: 'AZ', insuranceExpiry: '2099-01-01', products: { heatPumps: true } },
  })
  assert.equal(hp.data.compliance.level, 'warn')
  assert.ok(hp.data.compliance.issues.some((i) => /HVAC license/.test(i.message)))

  // Insurance far in the future, not heat-pump, license n/a -> 'ok'
  const ok = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'All Good Pools', city: 'Z', state: 'FL', insuranceExpiry: '2099-01-01', products: { pumps: true } },
  })
  assert.equal(ok.data.compliance.level, 'ok')
})

test('invited users must change password; self-service change works', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const created = await api('/api/users', {
    method: 'POST', token: adminToken,
    body: { email: 'pwtest@moovpool.com', name: 'PW Test', role: 'dispatch', password: 'temp1234' },
  })
  assert.equal(created.data.mustChangePassword, true)

  // First login reflects the forced-change flag.
  const login1 = await api('/api/auth/login', { method: 'POST', body: { email: 'pwtest@moovpool.com', password: 'temp1234' } })
  assert.equal(login1.data.user.mustChangePassword, true)
  const userToken = login1.data.token

  // Wrong current password is rejected; too-short new password is rejected.
  assert.equal((await api('/api/auth/change-password', { method: 'POST', token: userToken, body: { currentPassword: 'wrong', newPassword: 'longenough1' } })).status, 400)
  assert.equal((await api('/api/auth/change-password', { method: 'POST', token: userToken, body: { currentPassword: 'temp1234', newPassword: 'short' } })).status, 400)

  // Successful change clears the flag and the new password works.
  assert.equal((await api('/api/auth/change-password', { method: 'POST', token: userToken, body: { currentPassword: 'temp1234', newPassword: 'brandnew1234' } })).status, 200)
  const login2 = await api('/api/auth/login', { method: 'POST', body: { email: 'pwtest@moovpool.com', password: 'brandnew1234' } })
  assert.equal(login2.status, 200)
  assert.equal(login2.data.user.mustChangePassword, false)
})

test('bulk import: creates new and updates existing (matched by ID); dispatch role denied', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  // Lat/Lng provided so no network geocoding is needed.
  const csv = [
    'ID,Company,City,State,Lat,Lng,Service Radius (mi),Status,Product: Heat Pumps',
    ',Imported HVAC Co,Dallas,TX,32.7767,-96.797,30,active,yes',
    'st_01,Ideal Contracting LLC,Monroe,CT,41.3326,-73.2371,40,active,yes',
  ].join('\n')

  const fd = new FormData()
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'stations.csv')
  const res = await fetch(base + '/api/stations/import', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd })
  const data = await res.json()
  assert.equal(res.status, 200)
  assert.equal(data.created, 1)
  assert.equal(data.updated, 1)
  assert.equal(data.errors.length, 0)

  const stations = (await api('/api/stations', { token: adminToken })).data
  const created = stations.find((s) => s.company === 'Imported HVAC Co')
  assert.ok(created && created.products.heatPumps === true)
  assert.equal(stations.find((s) => s.id === 'st_01').serviceRadiusMi, 40)

  // Dispatch role cannot import.
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const fd2 = new FormData()
  fd2.append('file', new Blob([csv], { type: 'text/csv' }), 'stations.csv')
  const denied = await fetch(base + '/api/stations/import', { method: 'POST', headers: { Authorization: `Bearer ${dispatchToken}` }, body: fd2 })
  assert.equal(denied.status, 403)
})

test('activity log: admin-only, records service-log entries', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api('/api/activity', { token: dispatchToken })).status, 403)
  await api('/api/stations/st_03/service-events', { method: 'POST', token: dispatchToken, body: { accepted: true, completed: false } })
  const log = await api('/api/activity', { token: adminToken })
  assert.equal(log.status, 200)
  assert.ok(log.data.some((e) => e.action === 'service.log' && e.actor === 'dispatch@moovpool.com'))
})
