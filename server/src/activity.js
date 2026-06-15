// Activity / audit log. logActivity records who did what; listActivity reads it
// back for the admin Activity screen. Logging never throws into the request path —
// an audit failure should not break the action being audited.

import { db, rowToActivity } from './db.js'

const insertStmt = db.prepare(
  `INSERT INTO activity_log (actor, actor_name, action, entity_type, entity_id, summary)
   VALUES (@actor, @actor_name, @action, @entity_type, @entity_id, @summary)`
)

export function logActivity({ actor, actorName, action, entityType, entityId, summary }) {
  try {
    insertStmt.run({
      actor: actor || null,
      actor_name: actorName || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId != null ? String(entityId) : null,
      summary: summary || null,
    })
  } catch (err) {
    console.warn('activity log failed:', err.message)
  }
}

// Convenience: pull actor from an authenticated request.
export function logFromReq(req, fields) {
  logActivity({ actor: req.user?.email, actorName: req.user?.name, ...fields })
}

export function listActivity({ action, actor, limit = 200 } = {}) {
  let sql = 'SELECT * FROM activity_log'
  const where = []
  const params = {}
  if (action) {
    where.push('action = @action')
    params.action = action
  }
  if (actor) {
    where.push('actor = @actor')
    params.actor = actor
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY id DESC LIMIT @limit'
  params.limit = Math.min(Number(limit) || 200, 1000)
  return db.prepare(sql).all(params).map(rowToActivity)
}
