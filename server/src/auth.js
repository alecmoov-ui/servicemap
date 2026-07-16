// Authentication: JWT issuing/verification and role-enforcing middleware.
// Roles are enforced HERE, on the server — the UI gating is convenience only.

import jwt from 'jsonwebtoken'

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me'
if (!process.env.JWT_SECRET) {
  console.warn('⚠  JWT_SECRET not set — using an insecure dev secret. Set it in production.')
}

// Policy:
//  - admin (Network Admin): full control.
//  - dtm (Territory Manager): same as admin EXCEPT managing users.
//  - dispatch: log service tickets + view map/analytics only; no station or user edits.
const PERMISSIONS = {
  admin: { viewAnalytics: true, logService: true, exportData: true, addStations: true, editStations: true, deleteStations: true, backups: true, viewAudit: true, manageUsers: true },
  dtm: { viewAnalytics: true, logService: true, exportData: true, addStations: true, editStations: true, deleteStations: true, backups: true, viewAudit: true, manageUsers: false },
  dispatch: { viewAnalytics: true, logService: true, exportData: false, addStations: false, editStations: false, deleteStations: false, backups: false, viewAudit: false, manageUsers: false },
}

export function can(role, action) {
  return !!PERMISSIONS[role]?.[action]
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, {
    expiresIn: '12h',
  })
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' })
  }
}

// requirePermission('editStations') -> 403 unless the user's role allows it.
export function requirePermission(action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!can(req.user.role, action)) {
      return res.status(403).json({ error: `Your role (${req.user.role}) cannot perform this action.` })
    }
    next()
  }
}
