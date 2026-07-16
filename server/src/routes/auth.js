import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { signToken, requireAuth } from '../auth.js'
import { logActivity, logFromReq } from '../activity.js'

export const authRouter = Router()

const safeUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  mustChangePassword: !!u.must_change_password,
})

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim())
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  const safe = safeUser(user)
  logActivity({ actor: safe.email, actorName: safe.name, action: 'login', entityType: 'session', summary: `${safe.name} signed in` })
  res.json({ token: signToken(safe), user: safe })
})

// Read fresh from the DB so flags like mustChangePassword reflect current state.
authRouter.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub)
  if (!user) return res.status(401).json({ error: 'Account no longer exists' })
  res.json({ user: safeUser(user) })
})

// Self-service password change for the logged-in user.
authRouter.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub)
  if (!user) return res.status(401).json({ error: 'Account no longer exists' })
  if (!bcrypt.compareSync(currentPassword || '', user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' })
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, temp_password = NULL WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), user.id)
  logFromReq(req, { action: 'user.password', entityType: 'user', entityId: user.id, summary: `${user.name} changed their password` })
  res.json({ ok: true })
})
