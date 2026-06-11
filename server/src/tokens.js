// Signed, single-use accept/decline tokens for dispatch emails.
// The station clicks a link containing this token; the server verifies it and
// records the response. Single-use is enforced via the dispatch.token_used flag.

import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './auth.js'

export function signResponseToken(dispatchId, action) {
  return jwt.sign({ d: dispatchId, a: action, kind: 'dispatch-response' }, JWT_SECRET, {
    expiresIn: '14d',
  })
}

export function verifyResponseToken(token) {
  const payload = jwt.verify(token, JWT_SECRET)
  if (payload.kind !== 'dispatch-response') throw new Error('Wrong token kind')
  return { dispatchId: payload.d, action: payload.a }
}
