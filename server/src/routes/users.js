import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { requireAuth, requirePermission, ROLE_KEYS } from '../auth.js'
import { logFromReq } from '../activity.js'

export const usersRouter = Router()
usersRouter.use(requireAuth, requirePermission('manageUsers'))

// Passwords are set by the admin who creates the account and are permanent (no
// temp/first-login flow). Only the bcrypt hash is stored; it is never returned.
const safe = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at })
const adminCount = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n
const MIN_PW = 6

usersRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all()
  res.json(rows.map(safe))
})

usersRouter.post('/', (req, res) => {
  const { email, name, role, password } = req.body || {}
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' })
  if (!ROLE_KEYS.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (String(password).length < MIN_PW) return res.status(400).json({ error: `Password must be at least ${MIN_PW} characters` })
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase().trim())
  if (exists) return res.status(409).json({ error: 'A user with that email already exists' })
  const info = db
    .prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), name, role, bcrypt.hashSync(password, 10))
  logFromReq(req, { action: 'user.create', entityType: 'user', entityId: info.lastInsertRowid, summary: `Created ${name} (${email}) as ${role}` })
  res.status(201).json(safe(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)))
})

usersRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { name, role, password } = req.body || {}

  if (role && role !== user.role) {
    if (!ROLE_KEYS.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    if (user.role === 'admin' && adminCount() <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin' })
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  }
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
  if (password) {
    if (String(password).length < MIN_PW) return res.status(400).json({ error: `Password must be at least ${MIN_PW} characters` })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), id)
  }
  logFromReq(req, { action: 'user.update', entityType: 'user', entityId: id, summary: `Updated ${user.email}${role && role !== user.role ? ` → ${role}` : ''}${password ? ' (password set)' : ''}` })
  res.json(safe(db.prepare('SELECT * FROM users WHERE id = ?').get(id)))
})

usersRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (id === Number(req.user.sub)) return res.status(400).json({ error: 'You cannot delete your own account' })
  if (user.role === 'admin' && adminCount() <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' })
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  logFromReq(req, { action: 'user.delete', entityType: 'user', entityId: id, summary: `Removed ${user.email}` })
  res.json({ ok: true })
})
