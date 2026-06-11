import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { db } from '../db.js'
import { requireAuth, requirePermission } from '../auth.js'

export const usersRouter = Router()
usersRouter.use(requireAuth, requirePermission('manageUsers'))

const ROLES = ['admin', 'dtm', 'dispatch']
const safe = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at })
const adminCount = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n

usersRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all()
  res.json(rows.map(safe))
})

usersRouter.post('/', (req, res) => {
  const { email, name, role, password } = req.body || {}
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password are required' })
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase().trim())
  if (exists) return res.status(409).json({ error: 'A user with that email already exists' })
  const info = db
    .prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), name, role, bcrypt.hashSync(password, 10))
  res.status(201).json(safe(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)))
})

usersRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { name, role, password } = req.body || {}

  if (role && role !== user.role) {
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    if (user.role === 'admin' && role !== 'admin' && adminCount() <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last admin' })
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  }
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
  if (password) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id)
  }
  res.json(safe(db.prepare('SELECT * FROM users WHERE id = ?').get(id)))
})

usersRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (id === Number(req.user.sub)) return res.status(400).json({ error: 'You cannot delete your own account' })
  if (user.role === 'admin' && adminCount() <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' })
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.json({ ok: true })
})
