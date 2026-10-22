// Postal-code parsing used by the geocoder fallbacks (no network needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePostal } from '../src/geocode.js'

test('parsePostal: Canadian postal codes in any casing/spacing; US ZIPs; none otherwise', () => {
  assert.deepEqual(parsePostal('g1c 8j6', 'CA'), { full: 'G1C 8J6', area: 'G1C', raw: 'g1c 8j6' })
  assert.deepEqual(parsePostal('123 Rue Principale, Québec, QC g1c8j6', 'CA').full, 'G1C 8J6')
  assert.equal(parsePostal('Toronto, ON', 'CA'), null)
  assert.deepEqual(parsePostal('Lakeland, FL 33809-1234', 'US'), { full: '33809', area: '33809', raw: '33809-1234' })
  assert.equal(parsePostal('Orlando, FL', 'US'), null)
  // A US ZIP is not mistaken for a Canadian code and vice versa.
  assert.equal(parsePostal('33809', 'CA'), null)
  assert.equal(parsePostal('G1C 8J6', 'US'), null)
})
