// PUBLIC endpoint — the service station clicks the accept/decline link in the
// dispatch email. No login required; trust comes from the signed, single-use
// token. Validates the token, records the response once, and reports the result.

import { Router } from 'express'
import { db } from '../db.js'
import { verifyResponseToken } from '../tokens.js'
import { getDispatch, advance } from '../dispatchService.js'

export const respondRouter = Router()

respondRouter.post('/', (req, res) => {
  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Missing token' })

  let decoded
  try {
    decoded = verifyResponseToken(token)
  } catch {
    return res.status(400).json({ error: 'This link is invalid or has expired.' })
  }

  const row = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(decoded.dispatchId)
  if (!row) return res.status(404).json({ error: 'Dispatch not found.' })

  if (row.token_used) {
    return res.json({
      alreadyResponded: true,
      status: row.status,
      dispatch: getDispatch(row.id),
    })
  }

  const status = decoded.action === 'accept' ? 'accepted' : 'declined'
  const dispatch = advance(row.id, status, 'Responded via email link', 'station')
  db.prepare('UPDATE dispatches SET token_used = 1 WHERE id = ?').run(row.id)
  res.json({ status, dispatch })
})
