import { Router } from 'express'
import { requireAuth, requirePermission } from '../auth.js'
import { listActivity } from '../activity.js'

export const activityRouter = Router()
activityRouter.use(requireAuth, requirePermission('viewAudit'))

activityRouter.get('/', (req, res) => {
  res.json(listActivity({ action: req.query.action, actor: req.query.actor, limit: req.query.limit }))
})
