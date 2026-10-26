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
  process.env.DISABLE_RATE_LIMIT = 'true'
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

test('master records cannot be deleted; non-master can (admin/DTM only)', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  assert.equal((await api('/api/stations/st_01', { method: 'DELETE', token: adminToken })).status, 403) // master protected
  const created = await api('/api/stations', { method: 'POST', token: adminToken, body: { company: 'Temp Co', city: 'X', state: 'TX' } })

  // Dispatch cannot remove stations.
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api(`/api/stations/${created.data.id}`, { method: 'DELETE', token: dispatchToken })).status, 403)

  // DTM can remove a non-master station.
  const dtmToken = await tokenFor('dtm@moovpool.com')
  assert.equal((await api(`/api/stations/${created.data.id}`, { method: 'DELETE', token: dtmToken })).status, 200)
})

test('dispatch requests + service log: counts, auto-link, outcomes, value/flag/one-trip; view-only roles cannot', async () => {
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api('/api/stations/st_02/requests', { method: 'POST', token: dispatchToken, body: {} })).status, 403)
  assert.equal((await api('/api/stations/st_02/service-events', { method: 'POST', token: dispatchToken, body: {} })).status, 403)

  const token = await tokenFor('dtm@moovpool.com')
  // Two requests: one will be completed (auto-accepted), one declined.
  const r1 = await api('/api/stations/st_02/requests', { method: 'POST', token, body: { product: 'Pump', location: 'Orlando, FL', zendeskTicket: 'Z1' } })
  assert.equal(r1.status, 201)
  assert.equal(r1.data.request.outcome, 'pending')
  assert.equal(r1.data.station.perf.dispatchRequests, 1)
  const r2 = (await api('/api/stations/st_02/requests', { method: 'POST', token, body: { product: 'Filter' } })).data.request
  const open = (await api('/api/stations/requests/open?country=US', { token })).data
  assert.equal(open.filter((r) => r.stationId === 'st_02').length, 2)
  assert.equal((await api(`/api/stations/st_02/requests/${r2.id}`, { method: 'PUT', token, body: { outcome: 'bogus' } })).status, 400)
  const declined = await api(`/api/stations/st_02/requests/${r2.id}`, { method: 'PUT', token, body: { outcome: 'declined', note: 'No tech available' } })
  assert.equal(declined.data.request.outcome, 'declined')

  // A flag needs a note; value must be numeric.
  assert.equal((await api('/api/stations/st_02/service-events', { method: 'POST', token, body: { flagged: true } })).status, 400)
  assert.equal((await api('/api/stations/st_02/service-events', { method: 'POST', token, body: { value: 'abc' } })).status, 400)

  // Logging a completion links the latest open request (r1) as accepted.
  const done = await api('/api/stations/st_02/service-events', {
    method: 'POST', token,
    body: { zendeskTicket: 'Z1', product: 'Pump', value: 250, oneTrip: true, flagged: true, flagNote: 'Arrived late, customer unhappy', eventDate: '2026-06-01' },
  })
  assert.equal(done.status, 201)
  const perf = done.data.perf
  assert.equal(perf.dispatchRequests, 2)
  assert.equal(perf.resolvedRequests, 2)
  assert.equal(perf.dispatchAccepted, 1)
  assert.equal(perf.dispatchSent, 1)
  assert.equal(perf.jobsCompleted, 1)
  assert.equal(perf.totalValue, 250)
  assert.equal(perf.flags, 1)
  assert.equal(perf.oneTrip, 1)
  const reqs = (await api('/api/stations/st_02/requests', { token })).data
  const linked = reqs.find((r) => r.id === r1.data.request.id)
  assert.equal(linked.outcome, 'accepted')
  assert.ok(linked.serviceEventId)
  const events = (await api('/api/stations/st_02/service-events', { token })).data
  assert.equal(events[0].requestId, r1.data.request.id)
  assert.equal(events[0].flagNote, 'Arrived late, customer unhappy')
  assert.equal(events[0].oneTrip, true)

  // "Not needed" counts as accepted but not sent.
  const r3 = (await api('/api/stations/st_02/requests', { method: 'POST', token, body: {} })).data.request
  const nn = await api(`/api/stations/st_02/requests/${r3.id}`, { method: 'PUT', token, body: { outcome: 'not_needed' } })
  assert.equal(nn.data.station.perf.dispatchAccepted, 2)
  assert.equal(nn.data.station.perf.dispatchSent, 1)

  // Removing the completion unlinks the request (it stays accepted).
  assert.equal((await api(`/api/stations/st_02/service-events/${events[0].id}`, { method: 'DELETE', token })).status, 200)
  const after = (await api('/api/stations/st_02/requests', { token })).data.find((r) => r.id === r1.data.request.id)
  assert.equal(after.serviceEventId, null)
  assert.equal(after.outcome, 'accepted')
})

test('CSV export: allowed for admin/dtm, denied for dispatch', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const res = await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${adminToken}` } })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /csv/)
  const text = await res.text()
  assert.match(text, /Company,Service Address/)

  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const denied = await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${dispatchToken}` } })
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

  // Refrigerant heat-pump qualified but no HVAC license -> 'warn'
  const hp = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'No License HVAC', city: 'Y', state: 'AZ', insuranceExpiry: '2099-01-01', products: { heatPumpRefrigerant: true } },
  })
  assert.equal(hp.data.compliance.level, 'warn')
  assert.ok(hp.data.compliance.issues.some((i) => /HVAC license/.test(i.message)))

  // Electrical-only heat-pump center does NOT require an HVAC license -> 'ok'
  const elec = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Electrical Only HP', city: 'Y2', state: 'AZ', insuranceExpiry: '2099-01-01', products: { heatPumpElectrical: true } },
  })
  assert.equal(elec.data.compliance.level, 'ok')

  // Insurance far in the future, not heat-pump, license n/a -> 'ok'
  const ok = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'All Good Pools', city: 'Z', state: 'FL', insuranceExpiry: '2099-01-01', products: { pumps: true } },
  })
  assert.equal(ok.data.compliance.level, 'ok')
})

test('user creation: permanent password, sales role is view-only, dtm can manage users', async () => {
  const dtmToken = await tokenFor('dtm@moovpool.com')
  const created = await api('/api/users', {
    method: 'POST', token: dtmToken,
    body: { email: 'newrep@moovpool.com', name: 'Sales Rep', role: 'sales', password: 'sales1234' },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.role, 'sales')
  // No temp-password / forced-change flow: the hash is never returned and login works as-is.
  assert.equal(created.data.tempPassword, undefined)
  assert.equal(created.data.mustChangePassword, undefined)
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'newrep@moovpool.com', password: 'sales1234' } })
  assert.equal(login.status, 200)
  assert.equal(login.data.user.mustChangePassword, undefined)
  const salesToken = login.data.token

  // Sales can view but not change anything.
  assert.equal((await api('/api/stations', { token: salesToken })).status, 200)
  assert.equal((await api('/api/stations', { method: 'POST', token: salesToken, body: { company: 'Nope' } })).status, 403)
  assert.equal((await api('/api/stations/st_01', { method: 'PUT', token: salesToken, body: { company: 'Nope' } })).status, 403)
  assert.equal((await api('/api/stations/st_01/service-events', { method: 'POST', token: salesToken, body: {} })).status, 403)
  assert.equal((await api('/api/users', { token: salesToken })).status, 403)
  assert.equal((await api('/api/activity', { token: salesToken })).status, 403)

  // Unknown roles are rejected; the list shows every user with their role.
  assert.equal((await api('/api/users', { method: 'POST', token: dtmToken, body: { email: 'x@moovpool.com', name: 'X', role: 'ceo', password: 'abcdef1' } })).status, 400)
  const listed = (await api('/api/users', { token: dtmToken })).data.find((u) => u.email === 'newrep@moovpool.com')
  assert.equal(listed.role, 'sales')

  // Admin-set password replaces the old one immediately (no forced change).
  assert.equal((await api(`/api/users/${created.data.id}`, { method: 'PUT', token: dtmToken, body: { password: 'newpass99' } })).status, 200)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'newrep@moovpool.com', password: 'sales1234' } })).status, 401)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'newrep@moovpool.com', password: 'newpass99' } })).status, 200)

  // Self-service change still works for the signed-in user.
  assert.equal((await api('/api/auth/change-password', { method: 'POST', token: salesToken, body: { currentPassword: 'wrong', newPassword: 'longenough1' } })).status, 400)
  assert.equal((await api('/api/auth/change-password', { method: 'POST', token: salesToken, body: { currentPassword: 'newpass99', newPassword: 'brandnew1234' } })).status, 200)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'newrep@moovpool.com', password: 'brandnew1234' } })).status, 200)
})

test('bulk import: creates new and updates existing (matched by ID); dispatch role denied', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  // Lat/Lng provided so no network geocoding is needed.
  const csv = [
    // Uses the LEGACY "Product: Heat Pumps" header (maps to electrical) + an extra contact.
    'ID,Company,City,State,Lat,Lng,Service Radius (mi),Status,Contact 2 Name,Contact 2 Title,Product: Heat Pumps',
    ',Imported HVAC Co,Dallas,TX,32.7767,-96.797,30,active,Pat Lee,Dispatch,yes',
    'st_01,Ideal Contracting LLC,Monroe,CT,41.3326,-73.2371,40,active,,,yes',
  ].join('\n')

  const fd = new FormData()
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'stations.csv')
  const res = await fetch(base + '/api/stations/import?country=US', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd })
  const data = await res.json()
  assert.equal(res.status, 200)
  assert.equal(data.created, 1)
  assert.equal(data.updated, 1)
  assert.equal(data.errors.length, 0)

  const stations = (await api('/api/stations', { token: adminToken })).data
  // Legacy "Heat Pumps" column maps to electrical only (refrigerant must be explicit).
  const created = stations.find((s) => s.company === 'Imported HVAC Co')
  assert.ok(created && created.products.heatPumpElectrical === true)
  assert.ok(!created.products.heatPumpRefrigerant)
  // The extra contact column populated the contacts array.
  assert.equal(created.contacts.length, 1)
  assert.equal(created.contacts[0].name, 'Pat Lee')
  assert.equal(created.contacts[0].title, 'Dispatch')
  assert.equal(stations.find((s) => s.id === 'st_01').serviceRadiusMi, 40)

  // Dispatch role cannot import.
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  const fd2 = new FormData()
  fd2.append('file', new Blob([csv], { type: 'text/csv' }), 'stations.csv')
  const denied = await fetch(base + '/api/stations/import?country=US', { method: 'POST', headers: { Authorization: `Bearer ${dispatchToken}` }, body: fd2 })
  assert.equal(denied.status, 403)
})

test('activity log: admin/dtm only, records service-log entries', async () => {
  const adminToken = await tokenFor('admin@moovpool.com')
  const dtmToken = await tokenFor('dtm@moovpool.com')
  const dispatchToken = await tokenFor('dispatch@moovpool.com')
  assert.equal((await api('/api/activity', { token: dispatchToken })).status, 403)
  await api('/api/stations/st_03/service-events', { method: 'POST', token: dtmToken, body: { product: 'Pump' } })
  const log = await api('/api/activity', { token: adminToken })
  assert.equal(log.status, 200)
  assert.ok(log.data.some((e) => e.action === 'service.log' && e.actor === 'dtm@moovpool.com'))
})

test('multi-location stations: serviceAreas round-trip, export column, import parsing', async () => {
  const token = await tokenFor('admin@moovpool.com')
  const areas = [{ label: 'Naples branch', address: '1 Main St', city: 'Naples', state: 'fl', zip: '', lat: 26.14, lng: -81.79, radiusMi: 30 }]
  const created = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Two Town Pools', city: 'Fort Myers', state: 'FL', lat: 26.64, lng: -81.87, serviceRadiusMi: 25, products: { pumps: true }, serviceAreas: areas },
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.serviceAreas.length, 1)
  assert.equal(created.data.serviceAreas[0].state, 'FL') // normalized
  assert.equal(created.data.serviceAreas[0].radiusMi, 30)

  // Update leaves areas untouched when not sent; replaces them when sent.
  const upd1 = await api(`/api/stations/${created.data.id}`, { method: 'PUT', token, body: { phone: '555-0100' } })
  assert.equal(upd1.data.serviceAreas.length, 1)
  const upd2 = await api(`/api/stations/${created.data.id}`, { method: 'PUT', token, body: { serviceAreas: [] } })
  assert.equal(upd2.data.serviceAreas.length, 0)

  // Export carries the areas column; import parses it (lat/lng given, so no geocoding).
  await api(`/api/stations/${created.data.id}`, { method: 'PUT', token, body: { serviceAreas: areas } })
  const csvRes = await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${token}` } })
  const csv = await csvRes.text()
  assert.match(csv, /Additional Service Areas/)
  assert.match(csv, /Naples branch \| 1 Main St \| Naples \| FL \| 30 mi \| 26.14 \| -81.79/)

  const importCsv = [
    'ID,Company,City,State,Lat,Lng,Additional Service Areas',
    `${created.data.id},Two Town Pools,Fort Myers,FL,26.64,-81.87,"Cape Coral | 9 Pine Rd | Cape Coral | FL | 20 mi | 26.56 | -81.95\nPunta Gorda |  | Punta Gorda | FL | 15 mi | 26.93 | -82.05"`,
  ].join('\n')
  const fd = new FormData()
  fd.append('file', new Blob([importCsv], { type: 'text/csv' }), 'areas.csv')
  const imp = await fetch(base + '/api/stations/import?country=US', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
  assert.equal((await imp.json()).updated, 1)
  const after = (await api('/api/stations', { token })).data.find((s) => s.id === created.data.id)
  assert.equal(after.serviceAreas.length, 2)
  assert.equal(after.serviceAreas[1].city, 'Punta Gorda')
  assert.equal(after.serviceAreas[1].radiusMi, 15)
})

test('merge: folds duplicate records into one station; masters cannot be merged away; view-only denied', async () => {
  const token = await tokenFor('admin@moovpool.com')
  const mk = (city, lat, lng, extra = {}) => api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Pool Cool of FL', city, state: 'FL', lat, lng, serviceRadiusMi: 25, products: { pumps: true }, ...extra },
  })
  const target = (await mk('Tampa', 27.95, -82.46, { primaryContact: 'Ann', phone: '555-1', email: 'ann@poolcool.test' })).data
  const dupA = (await mk('Orlando', 28.54, -81.38, { primaryContact: 'Bob', phone: '555-2', email: 'bob@poolcool.test', contacts: [{ name: 'Cy', title: 'Tech', phone: '555-3', email: '' }] })).data
  const dupB = (await mk('Miami', 25.77, -80.19, { serviceRadiusMi: 40, primaryContact: 'Ann', phone: '555-1', email: 'ann@poolcool.test' })).data
  // A service-log entry and a request on a duplicate must move to the survivor.
  await api(`/api/stations/${dupA.id}/requests`, { method: 'POST', token, body: {} })
  await api(`/api/stations/${dupA.id}/service-events`, { method: 'POST', token, body: { value: 100 } })

  // View-only roles cannot merge; a master cannot be a source.
  const salesToken = await tokenFor('sales@moovpool.com')
  assert.equal((await api(`/api/stations/${target.id}/merge`, { method: 'POST', token: salesToken, body: { sourceIds: [dupA.id] } })).status, 403)
  const masterAsSource = await api(`/api/stations/${target.id}/merge`, { method: 'POST', token, body: { sourceIds: ['st_05'] } })
  assert.equal(masterAsSource.status, 400)
  assert.ok((await api('/api/stations', { token })).data.some((s) => s.id === 'st_05')) // master untouched

  const merged = await api(`/api/stations/${target.id}/merge`, { method: 'POST', token, body: { sourceIds: [dupA.id, dupB.id, target.id] } })
  assert.equal(merged.status, 200)
  // Two new service areas, with each duplicate's own radius.
  assert.equal(merged.data.serviceAreas.length, 2)
  assert.deepEqual(merged.data.serviceAreas.map((a) => a.city).sort(), ['Miami', 'Orlando'])
  assert.equal(merged.data.serviceAreas.find((a) => a.city === 'Miami').radiusMi, 40)
  // Contacts: Bob + Cy added; Ann (same as target's primary) not duplicated.
  assert.deepEqual(merged.data.contacts.map((c) => c.name).sort(), ['Bob', 'Cy'])
  // Service log + request moved → performance is now on the survivor.
  assert.equal(merged.data.perf.jobsCompleted, 1)
  assert.equal(merged.data.perf.dispatchRequests, 1)
  assert.equal(merged.data.perf.totalValue, 100)
  // Duplicates are gone.
  const all = (await api('/api/stations', { token })).data
  assert.ok(!all.some((s) => s.id === dupA.id || s.id === dupB.id))
  assert.equal(all.filter((s) => s.company === 'Pool Cool of FL').length, 1)
})

test('regions: user home country, station country, km export/import for Canada, same-region merge', async () => {
  const token = await tokenFor('admin@moovpool.com')

  // Users carry a home country (default US), editable via a dropdown value.
  const u = await api('/api/users', { method: 'POST', token, body: { email: 'ca.rep@moovpool.com', name: 'CA Rep', role: 'sales', password: 'canada123', country: 'CA' } })
  assert.equal(u.status, 201)
  assert.equal(u.data.country, 'CA')
  const login = await api('/api/auth/login', { method: 'POST', body: { email: 'ca.rep@moovpool.com', password: 'canada123' } })
  assert.equal(login.data.user.country, 'CA')
  assert.equal((await api(`/api/users/${u.data.id}`, { method: 'PUT', token, body: { country: 'MX' } })).status, 400)
  assert.equal((await api(`/api/users/${u.data.id}`, { method: 'PUT', token, body: { country: 'US' } })).data.country, 'US')
  const me = (await api('/api/auth/me', { token })).data.user
  assert.equal(me.country, 'US') // existing users default to US

  // Existing/seeded stations are US; a Canadian station stores miles but exports km.
  const all = (await api('/api/stations', { token })).data
  assert.ok(all.every((s) => s.country === 'US'))
  const ca = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Maple Pools', city: 'Mississauga', state: 'ON', country: 'CA', lat: 43.589, lng: -79.644, serviceRadiusMi: 18.6, products: { pumps: true },
      serviceAreas: [{ label: 'Hamilton', city: 'Hamilton', state: 'ON', lat: 43.2557, lng: -79.8711, radiusMi: 12.4 }] },
  })
  assert.equal(ca.status, 201)
  assert.equal(ca.data.country, 'CA')
  assert.equal(ca.data.serviceRadiusMi, 18.6)

  const caCsv = await (await fetch(base + '/api/stations/export.csv?country=CA', { headers: { Authorization: `Bearer ${token}` } })).text()
  assert.match(caCsv.split('\n')[0], /Service Radius \(km\)/)
  assert.match(caCsv, /Maple Pools/)
  assert.doesNotMatch(caCsv, /Ideal Contracting/) // US stations stay out of the Canadian file
  assert.match(caCsv, /Hamilton \| .*\| 20 km \|/) // 12.4 mi -> 20 km
  const usCsv = await (await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${token}` } })).text()
  assert.match(usCsv.split('\n')[0], /Service Radius \(miles\)/)
  assert.doesNotMatch(usCsv, /Maple Pools/)

  // Import under the Canadian region: km column converts to miles; Country defaults to CA.
  const csv = [
    'ID,Company,City,Province,Lat,Lng,Service Radius (km),Additional Service Areas',
    `${ca.data.id},Maple Pools,Mississauga,ON,43.589,-79.644,50,"Oakville | | Oakville | ON | 16 km | 43.4675 | -79.6877"`,
    ',Prairie Pool Care,Regina,SK,50.4452,-104.6189,40,',
  ].join('\n')
  const fd = new FormData()
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'ca.csv')
  const imp = await (await fetch(base + '/api/stations/import?country=CA', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })).json()
  assert.equal(imp.errors.length, 0)
  const after = (await api('/api/stations', { token })).data
  const maple = after.find((s) => s.id === ca.data.id)
  assert.equal(maple.serviceRadiusMi, 31.1) // 50 km
  assert.equal(maple.serviceAreas[0].radiusMi, 9.9) // 16 km
  const prairie = after.find((s) => s.company === 'Prairie Pool Care')
  assert.equal(prairie.country, 'CA')
  assert.equal(prairie.serviceRadiusMi, 24.9) // 40 km

  // Merging across regions is refused.
  const cross = await api(`/api/stations/${maple.id}/merge`, { method: 'POST', token, body: { sourceIds: [all.find((s) => !s.isMaster)?.id || 'st_01'] } })
  assert.equal(cross.status, 400)
})

test('coverage outlines: polygon round-trip on station + area, normalisation, CSV column', async () => {
  const token = await tokenFor('admin@moovpool.com')
  const outline = [[26.2, -81.9], [26.2, -81.6], [25.9, -81.6], [25.9, -81.9]]
  const created = await api('/api/stations', {
    method: 'POST', token,
    body: { company: 'Outline Pools', city: 'Naples', state: 'FL', lat: 26.14, lng: -81.79, serviceRadiusMi: 25, products: { pumps: true },
      coveragePolygon: outline,
      serviceAreas: [{ label: 'East', city: 'Immokalee', state: 'FL', lat: 26.42, lng: -81.42, radiusMi: 15, polygon: [[26.5, -81.5], [26.5, -81.3], [26.3, -81.4]] }] },
  })
  assert.equal(created.status, 201)
  assert.deepEqual(created.data.coveragePolygon, outline)
  assert.equal(created.data.serviceAreas[0].polygon.length, 3)

  // Fewer than 3 points, or junk, is stored as "no outline" (radius applies again).
  const cleared = await api(`/api/stations/${created.data.id}`, { method: 'PUT', token, body: { coveragePolygon: [[1, 2], ['x', null]] } })
  assert.deepEqual(cleared.data.coveragePolygon, [])
  await api(`/api/stations/${created.data.id}`, { method: 'PUT', token, body: { coveragePolygon: outline } })

  // Export carries the outline column and the area's outline segment; import reads both back.
  const csv = await (await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${token}` } })).text()
  assert.match(csv.split('\n')[0], /Coverage Outline/)
  assert.match(csv, /26.2,-81.9; 26.2,-81.6; 25.9,-81.6; 25.9,-81.9/)
  assert.match(csv, /East \| .*\| 26.5,-81.5 26.5,-81.3 26.3,-81.4/)

  const importCsv = [
    'ID,Company,City,State,Lat,Lng,Coverage Outline,Additional Service Areas',
    `${created.data.id},Outline Pools,Naples,FL,26.14,-81.79,"27,-82; 27,-81.5; 26.6,-81.7","West | | Marco Island | FL | 10 mi | 25.94 | -81.72 | 26,-81.8 26,-81.6 25.8,-81.7"`,
  ].join('\n')
  const fd = new FormData()
  fd.append('file', new Blob([importCsv], { type: 'text/csv' }), 'outline.csv')
  const imp = await (await fetch(base + '/api/stations/import?country=US', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })).json()
  assert.equal(imp.errors.length, 0)
  const after = (await api('/api/stations', { token })).data.find((s) => s.id === created.data.id)
  assert.deepEqual(after.coveragePolygon, [[27, -82], [27, -81.5], [26.6, -81.7]])
  assert.equal(after.serviceAreas[0].city, 'Marco Island')
  assert.deepEqual(after.serviceAreas[0].polygon, [[26, -81.8], [26, -81.6], [25.8, -81.7]])
})

test('backups: restore rolls station data back to a snapshot (safety snapshot first, users untouched)', async () => {
  const token = await tokenFor('admin@moovpool.com')
  const before = (await api('/api/stations', { token })).data.find((s) => s.id === 'st_02')
  const snap = await api('/api/admin/snapshot', { method: 'POST', token })
  assert.equal(snap.status, 201)

  // Damage: rename a station, add a service-log entry, create a station.
  await api('/api/stations/st_02', { method: 'PUT', token, body: { company: 'WRONG NAME', phone: '000' } })
  await api('/api/stations/st_02/service-events', { method: 'POST', token, body: { value: 80 } })
  const extra = (await api('/api/stations', { method: 'POST', token, body: { company: 'Should Vanish', city: 'X', state: 'TX', lat: 30, lng: -97, products: {} } })).data
  const sales = await tokenFor('sales@moovpool.com')
  assert.equal((await api(`/api/admin/snapshots/${snap.data.name}/restore?country=ALL`, { method: 'POST', token: sales })).status, 403)
  assert.equal((await api('/api/admin/snapshots/nope.db/restore?country=ALL', { method: 'POST', token })).status, 404)

  assert.equal((await api(`/api/admin/snapshots/${snap.data.name}/restore`, { method: 'POST', token })).status, 400) // region required
  const r = await api(`/api/admin/snapshots/${snap.data.name}/restore?country=ALL`, { method: 'POST', token })
  assert.equal(r.status, 200)
  assert.match(r.data.safety, /prerestore/)
  const after = (await api('/api/stations', { token })).data
  const st02 = after.find((s) => s.id === 'st_02')
  assert.equal(st02.company, before.company)
  assert.equal(st02.phone, before.phone)
  assert.equal(st02.perf.jobsCompleted, before.perf.jobsCompleted)
  assert.ok(!after.some((s) => s.id === extra.id))
  // Users and sessions survive; the restore is in the activity log; safety snapshot listed.
  assert.equal((await api('/api/auth/me', { token })).status, 200)
  assert.ok((await api('/api/activity', { token })).data.some((e) => e.action === 'data.restore'))
  assert.ok((await api('/api/admin/snapshots', { token })).data.some((s) => s.name === r.data.safety))
})

test('region isolation: export/import/restore are per division; writes from the other view are refused', async () => {
  const token = await tokenFor('admin@moovpool.com')
  const apiR = (path, opts = {}, region) => fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(region ? { 'X-Region': region } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }))

  // Region is mandatory on export/template/import — no silent default.
  assert.equal((await fetch(base + '/api/stations/export.csv', { headers: { Authorization: `Bearer ${token}` } })).status, 400)
  assert.equal((await fetch(base + '/api/stations/import-template.csv', { headers: { Authorization: `Bearer ${token}` } })).status, 400)

  const ca = (await api('/api/stations', { method: 'POST', token, body: { company: 'Iso Canada Co', city: 'Laval', state: 'QC', country: 'CA', lat: 45.6, lng: -73.7, serviceRadiusMi: 20, products: { pumps: true } } })).data
  const usBefore = (await api('/api/stations', { token })).data.find((s) => s.id === 'st_03')

  // 1. A US export (with IDs) re-uploaded under the CANADA view: refused, nothing touched.
  const usCsv = await (await fetch(base + '/api/stations/export.csv?country=US', { headers: { Authorization: `Bearer ${token}` } })).text()
  const fd = new FormData(); fd.append('file', new Blob([usCsv], { type: 'text/csv' }), 'us.csv')
  const wrongView = await fetch(base + '/api/stations/import?country=CA', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
  assert.equal(wrongView.status, 400)
  assert.match((await wrongView.json()).error, /only US stations/)

  // 2. A mixed file under CANADA: US rows (by ID, by Country column) are skipped; CA rows apply;
  //    a US company name without an ID becomes a NEW Canada record, never a cross-region update.
  const mixed = [
    'ID,Company,City,State,Lat,Lng,Country',
    `st_03,"${usBefore.company}",HACKED,TX,30,-97,`,
    `,"${usBefore.company}",HACKED2,TX,30,-97,`,
    `,Some US Co,Austin,TX,30.2,-97.7,US`,
    `,Bad Country Co,Austin,TX,30.2,-97.7,Mexico`,
    `${ca.id},Iso Canada Co,Laval,QC,45.6,-73.7,`,
    `,New Canada Co,Gatineau,QC,45.47,-75.7,`,
  ].join('\n')
  const fd2 = new FormData(); fd2.append('file', new Blob([mixed], { type: 'text/csv' }), 'mixed.csv')
  const r2 = await (await fetch(base + '/api/stations/import?country=CA', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd2 })).json()
  assert.equal(r2.otherRegion, 2, JSON.stringify(r2.errors))
  assert.equal(r2.errors.length, 3) // + the unrecognised Country row
  assert.ok(r2.errors.some((e) => /Country must be US or Canada/.test(e.message)))
  assert.equal(r2.updated, 1)
  assert.equal(r2.created, 2)
  const after = (await api('/api/stations', { token })).data
  const us = after.find((s) => s.id === 'st_03')
  assert.equal(us.city, usBefore.city)
  assert.equal(us.country, 'US')
  const dup = after.filter((s) => s.company === usBefore.company)
  assert.equal(dup.length, 2)
  assert.ok(dup.every((s) => (s.id === 'st_03' ? s.country === 'US' : s.country === 'CA')))
  assert.equal(after.find((s) => s.company === 'New Canada Co').country, 'CA')
  assert.ok(!after.some((s) => s.company === 'Some US Co' || s.company === 'Bad Country Co'))

  // 3. Writes carrying the active region are refused for the other division's stations.
  assert.equal((await apiR('/api/stations/st_03', { method: 'PUT', body: { phone: '1' } }, 'CA')).status, 409)
  assert.equal((await apiR(`/api/stations/${ca.id}`, { method: 'PUT', body: { phone: '1' } }, 'US')).status, 409)
  assert.equal((await apiR(`/api/stations/${ca.id}`, { method: 'DELETE' }, 'US')).status, 409)
  assert.equal((await apiR('/api/stations/st_03/service-events', { method: 'POST', body: {} }, 'CA')).status, 409)
  assert.equal((await apiR('/api/stations/st_03/requests', { method: 'POST', body: {} }, 'CA')).status, 409)
  assert.equal((await apiR(`/api/stations/${ca.id}/merge`, { method: 'POST', body: { sourceIds: ['st_03'] } }, 'US')).status, 409)
  assert.equal((await apiR(`/api/stations/${ca.id}`, { method: 'PUT', body: { phone: '1' } }, 'CA')).status, 200)
  const created = await apiR('/api/stations', { method: 'POST', body: { company: 'Header Region Co', city: 'Kelowna', state: 'BC', lat: 49.9, lng: -119.5, products: {} } }, 'CA')
  assert.equal(created.data.country, 'CA')

  // 4. Restore is per division: rolling back CANADA leaves US edits in place.
  const snap = (await api('/api/admin/snapshot', { method: 'POST', token })).data
  await api(`/api/stations/${ca.id}`, { method: 'PUT', token, body: { phone: 'CA-CHANGED' } })
  await api('/api/stations/st_03', { method: 'PUT', token, body: { phone: 'US-CHANGED' } })
  const rr = await api(`/api/admin/snapshots/${snap.name}/restore?country=CA`, { method: 'POST', token })
  assert.equal(rr.status, 200)
  const final = (await api('/api/stations', { token })).data
  assert.equal(final.find((s) => s.id === ca.id).phone, '1')
  assert.equal(final.find((s) => s.id === 'st_03').phone, 'US-CHANGED')
  assert.equal(final.filter((s) => s.country === 'US').length, after.filter((s) => s.country === 'US').length)
})
