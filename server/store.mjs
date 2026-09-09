import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cipher, hash, token, passwordHash } from './crypto.mjs';

export const platforms = ['discord', 'telegram', 'signal', 'whatsapp'];
const short = z.string().min(1).max(256);
export const eventSchema = z.object({
  eventId: short, kind: z.enum(['create', 'edit', 'delete']), externalId: short,
  scope: short, chatId: z.string().max(256).default(''), chatName: z.string().max(500).default(''),
  authorId: z.string().max(256).default(''), authorName: z.string().max(500).default(''),
  text: z.string().max(100_000).optional(), occurredAt: z.iso.datetime(),
  ephemeral: z.boolean().default(false),
  attachments: z.array(z.object({ name: z.string().max(500), type: z.string().max(100).default('file'), size: z.number().nonnegative().optional() })).max(50).default([])
}).refine(e => e.kind === 'delete' || e.text !== undefined || e.attachments.length > 0, 'Message content is required.');

export function createStore(path, encryptionKey) {
  const db = new DatabaseSync(path);
  const crypt = cipher(encryptionKey);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      created_at TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 90
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE,
      created_at TEXT NOT NULL, last_seen TEXT, paused INTEGER NOT NULL DEFAULT 0,
      revoked INTEGER NOT NULL DEFAULT 0, health TEXT NOT NULL DEFAULT 'waiting', detail TEXT NOT NULL DEFAULT '', queued INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      platform TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
      saved INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      event_uid TEXT NOT NULL, kind TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
      payload TEXT NOT NULL, UNIQUE(connection_id, event_uid)
    );
    CREATE INDEX IF NOT EXISTS messages_owner ON messages(user_id,last_seen DESC);
    CREATE INDEX IF NOT EXISTS events_message ON events(message_id,occurred_at,id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS forgotten (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);`);
  const getUser = id => db.prepare('SELECT id,username,created_at,retention_days FROM users WHERE id=?').get(id);
  const connections = user => db.prepare('SELECT id,platform,name,created_at,last_seen,paused,revoked,health,detail,queued FROM connections WHERE user_id=? ORDER BY created_at').all(user);
  function details(row) {
    const versions = db.prepare('SELECT * FROM events WHERE message_id=? ORDER BY occurred_at, CASE kind WHEN \'create\' THEN 0 WHEN \'edit\' THEN 1 ELSE 2 END, id').all(row.id)
      .map(e => ({ ...crypt.open(e.payload, `${row.user_id}:${row.id}:${e.event_uid}`), receivedAt: e.received_at, sequence: e.id }));
    const contents = versions.filter(v => v.kind !== 'delete');
    const last = contents.at(-1);
    const meta = [...contents].reverse().find(v => v.authorName || v.chatName) || versions[0];
    const deleted = versions.some(v => v.kind === 'delete');
    const edited = versions.some(v => v.kind === 'edit');
    return { id: row.id, platform: row.platform, connectionId: row.connection_id, firstSeen: row.first_seen, lastSeen: row.last_seen,
      saved: !!row.saved, status: deleted ? 'deleted' : edited ? 'edited' : 'captured',
      authorName: meta?.authorName || 'Unknown sender', authorId: meta?.authorId || '', chatName: meta?.chatName || meta?.chatId || 'Unknown conversation',
      externalId: meta?.externalId || '', text: last?.text ?? '', attachments: last?.attachments || [],
      originalMissing: !versions.some(v => v.kind === 'create'), versionCount: contents.length, versions };
  }
  function ingest(connection, input) {
    const e = eventSchema.parse(input);
    if (Date.parse(e.occurredAt) > Date.now() + 5 * 60_000) throw new Error('Event timestamp is in the future.');
    if (connection.revoked) throw new Error('Connection revoked.');
    if (connection.paused || e.ephemeral) return { ignored: true, reason: e.ephemeral ? 'ephemeral' : 'paused' };
    const id = hash(`${connection.id}:${e.scope}:${e.externalId}`);
    if (db.prepare('SELECT 1 FROM forgotten WHERE id=?').get(id)) return { ignored: true, reason: 'removed' };
    const uid = e.eventId;
    const now = new Date().toISOString();
    // One transaction prevents a crash from leaving a message without its event.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT 1 FROM events WHERE connection_id=? AND event_uid=?').get(connection.id, uid)) {
        db.exec('COMMIT'); return { duplicate: true, id };
      }
      db.prepare(`INSERT INTO messages (id,user_id,connection_id,platform,first_seen,last_seen) VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen`).run(id, connection.user_id, connection.id, connection.platform, now, now);
      db.prepare('INSERT INTO events (message_id,connection_id,event_uid,kind,occurred_at,received_at,payload) VALUES (?,?,?,?,?,?,?)')
        .run(id, connection.id, uid, e.kind, e.occurredAt, now, crypt.seal(e, `${connection.user_id}:${id}:${uid}`));
      db.exec('COMMIT');
      return { id, duplicate: false };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function purge() {
    db.prepare(`INSERT OR IGNORE INTO forgotten (id,user_id) SELECT id,user_id FROM messages WHERE user_id IN (SELECT id FROM users WHERE retention_days > 0)
      AND first_seen < (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || retention_days || ' days') FROM users WHERE id=messages.user_id)`).run();
    db.prepare(`DELETE FROM messages WHERE user_id IN (SELECT id FROM users WHERE retention_days > 0)
      AND first_seen < (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || retention_days || ' days') FROM users WHERE id=messages.user_id)`).run();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  }
  return { db, getUser, connections, ingest, purge,
    forgetMessage(id, userId) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT OR IGNORE INTO forgotten SELECT id,user_id FROM messages WHERE id=? AND user_id=?').run(id, userId);
        db.prepare('DELETE FROM messages WHERE id=? AND user_id=?').run(id, userId);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async createUser(username, password) {
      const id = randomUUID();
      db.prepare('INSERT INTO users (id,username,password,created_at) VALUES (?,?,?,?)').run(id, username.toLowerCase(), await passwordHash(password), new Date().toISOString());
      return getUser(id);
    },
    userByName(name) { return db.prepare('SELECT * FROM users WHERE username=?').get(name.toLowerCase()); },
    session(userId) {
      const secret = token();
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(secret), userId, new Date(Date.now() + 30 * 86400_000).toISOString());
      return secret;
    },
    authenticate(secret) {
      if (!secret) return null;
      const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(secret), new Date().toISOString());
      return row ? getUser(row.user_id) : null;
    },
    endSession(secret) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(secret || '')); },
    createConnection(userId, platform, name) {
      const id = randomUUID(), secret = `aw_${token()}`;
      db.prepare('INSERT INTO connections (id,user_id,platform,name,token_hash,created_at) VALUES (?,?,?,?,?,?)')
        .run(id, userId, platform, name, hash(secret), new Date().toISOString());
      return { ...connections(userId).find(c => c.id === id), token: secret };
    },
    connectionByToken(secret) { return secret ? db.prepare('SELECT * FROM connections WHERE token_hash=? AND revoked=0').get(hash(secret)) : null; },
    connection(id, userId) { return db.prepare('SELECT * FROM connections WHERE id=? AND user_id=?').get(id, userId); },
    messages(userId) { return db.prepare('SELECT * FROM messages WHERE user_id=? ORDER BY last_seen DESC,id').all(userId).map(details); },
    message(id, userId) { const row = db.prepare('SELECT * FROM messages WHERE id=? AND user_id=?').get(id, userId); return row ? details(row) : null; },
    close() { db.close(); }
  };
}
