// Startup migration: a database created before the `sales` role (users.role had a
// CHECK constraint + temp-password columns) must open, keep its users, and accept
// the new role. Runs in its own process (node --test), so it can build the old
// schema before db.js is imported.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

test('users table migration: drops role CHECK, preserves rows, accepts sales role', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'moov-migrate-'))
  process.env.DB_PATH = join(tmpDir, 'old.db')
  const old = new Database(process.env.DB_PATH)
  old.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','dtm','dispatch')), password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      must_change_password INTEGER NOT NULL DEFAULT 0, temp_password TEXT
    );
    INSERT INTO users (id, email, name, role, password_hash, created_at, must_change_password, temp_password)
      VALUES (7, 'mark.bailey@moovpool.com', 'Mark Bailey', 'dispatch', 'hash', '2026-01-02 03:04:05', 1, 'temp');`)
  old.close()

  const { db } = await import('../src/db.js')
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get()
  assert.doesNotMatch(sql, /CHECK/i)
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  assert.ok(!cols.includes('temp_password') && !cols.includes('must_change_password'))

  const kept = db.prepare('SELECT * FROM users WHERE id = 7').get()
  assert.equal(kept.email, 'mark.bailey@moovpool.com')
  assert.equal(kept.role, 'dispatch')
  assert.equal(kept.created_at, '2026-01-02 03:04:05')

  const info = db.prepare("INSERT INTO users (email, name, role, password_hash) VALUES ('s@moovpool.com', 'S', 'sales', 'h')").run()
  assert.ok(Number(info.lastInsertRowid) > 7) // AUTOINCREMENT sequence survived the rebuild

  db.close()
  rmSync(tmpDir, { recursive: true, force: true })
})
