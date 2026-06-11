// Integration tests for the API. These are the safety net: they exercise auth,
// role enforcement, master-record protection, the dispatch lifecycle (incl.
// single-use accept tokens), and user management. Run with `npm test`.
//
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
  process.env.JWT_SECRET = 'test-secret'
  process.env.EMAIL_TRANSPORT = 'log'
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

// --- helpers ---------------------------------------------------------------
async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
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

// --- tests -----------------------------------------------------------------
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

test('stations require auth and seed with 37 protected master records', async () => {
  const noAuth = await api('/api/stations')
  assert.equal(noAuth.status, 401)

  const token = await tokenFor('admin@moovpool.com')
  const r = await api('/api/stations', { token })
  assert.equal(r.status, 200)
  assert.equal(r.data.length, 37)
  assert.ok(r.data.every((s) => s.isMaster === true))
})

test('role enforcement: dispatch role cannot add stations, admin can', async () => {
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const denied = await api('/api/stations', { method: 'POST', token: dispatchToken, body: { company: 'Nope' } })
  assert.equal(denied.status, 403)

  const adminToken = await tokenFor('admin@moovpool.com')
  const created = await api('/api/stations', {
    method: 'POST',
    token: adminToken,
    body: { company: 'Test Pools', city: 'Denver', state: 'CO', lat: 39.7, lng: -105, products: { pumps: true } },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.isMaster, false)
})

test('master records cannot be deleted; non-master can', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const master = await api('/api/stations/st_01', { method: 'DELETE', token: adminToken })
  assert.equal(master.status, 403)

  const created = await api('/api/stations', {
    method: 'POST', token: adminToken, body: { company: 'Temp Co', city: 'X', state: 'TX' },
  })
  const del = await api(`/api/stations/${created.data.id}`, { method: 'DELETE', token: adminToken })
  assert.equal(del.status, 200)
})

test('dispatch lifecycle: create -> accept via single-use token -> counters update', async () => {
  const token = await tokenFor('dispatch@moovpool.com')
  const before = await api('/api/stations', { token })
  const st = before.data.find((s) => s.id === 'st_02')
  const acceptedBefore = st.perf.dispatchAccepted

  const created = await api('/api/dispatches', {
    method: 'POST', token,
    body: { stationId: 'st_02', product: 'Pump', distanceMi: 5, consumer: { address: 'Kissimmee, FL' } },
  })
  assert.equal(created.status, 201)
  assert.ok(created.data.email.acceptUrl.includes('/respond/'))
  assert.equal(created.data.dispatch.status, 'requested')

  const tokenStr = created.data.email.acceptUrl.split('/respond/')[1]
  const responded = await api('/api/respond', { method: 'POST', body: { token: tokenStr } })
  assert.equal(responded.status, 200)
  assert.equal(responded.data.status, 'accepted')

  // Re-clicking the same link is a no-op (single use).
  const again = await api('/api/respond', { method: 'POST', body: { token: tokenStr } })
  assert.equal(again.data.alreadyResponded, true)

  const after = await api('/api/stations', { token })
  const stAfter = after.data.find((s) => s.id === 'st_02')
  assert.equal(stAfter.perf.dispatchAccepted, acceptedBefore + 1)
})

test('user management: admin only; cannot delete the last admin', async () => {
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const denied = await api('/api/users', { token: dispatchToken })
  assert.equal(denied.status, 403)

  const adminToken = await tokenFor('admin@moovpool.com')
  const list = await api('/api/users', { token: adminToken })
  assert.equal(list.status, 200)
  assert.ok(list.data.length >= 3)

  const created = await api('/api/users', {
    method: 'POST', token: adminToken,
    body: { email: 'newtm@moovpool.com', name: 'New TM', role: 'dtm', password: 'secret123' },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.role, 'dtm')

  // The seeded admin is the only admin -> cannot be deleted.
  const adminId = list.data.find((u) => u.role === 'admin').id
  const delAdmin = await api(`/api/users/${adminId}`, { method: 'DELETE', token: adminToken })
  assert.equal(delAdmin.status, 400)
})
