import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Everything is stored in one SQLite file on this PC, outside the project folder
 * (so the web server can never serve it). Back it up by copying the file.
 */
export const DATA_DIR = process.env.SELAMONT_DATA_DIR ?? join(homedir(), '.selamont')
export const DB_PATH = join(DATA_DIR, 'selamont.db')

let instance: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (instance) return instance
  mkdirSync(DATA_DIR, { recursive: true })
  const d = new DatabaseSync(DB_PATH)
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS content_generations (
      id TEXT PRIMARY KEY, product_name TEXT, input TEXT, output TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

    CREATE TABLE IF NOT EXISTS store_analyses (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, score INTEGER, result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

    CREATE TABLE IF NOT EXISTS drops (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT,
      image_url TEXT, price TEXT, store_url TEXT, launch_at TEXT NOT NULL, quantity INTEGER,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','ended')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drop_id TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (drop_id, email));

    CREATE TABLE IF NOT EXISTS drop_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drop_id TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('view','click','signup')),
      visitor_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS drop_events_drop ON drop_events (drop_id, created_at);

    CREATE TABLE IF NOT EXISTS creators (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, niche TEXT, email TEXT, instagram TEXT, tiktok TEXT,
      youtube TEXT, audience_size INTEGER, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, product TEXT NOT NULL, brief TEXT,
      commission_pct REAL NOT NULL, product_value REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'invited'
        CHECK (status IN ('invited','shipped','submitted','approved','paid','declined')),
      referral_code TEXT, content_url TEXT, sales_total REAL NOT NULL DEFAULT 0, paid_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (campaign_id, creator_id));
  `)
  instance = d
  return d
}

export function newId(): string {
  return crypto.randomUUID()
}

export function getSetting(key: string): string | null {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string | null) {
  if (value === null) db().prepare('DELETE FROM settings WHERE key = ?').run(key)
  else db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

/** Parses JSON columns on rows coming back from SQLite. */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
