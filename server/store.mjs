import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { cipher, hash, token, passwordHash } from './crypto.mjs';
import { createArchiveReader } from './archive-reader.mjs';
import { createArchiveCapacity, eventBytes, MESSAGE_BYTES } from './archive-capacity.mjs';

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

export function createStore(path, encryptionKey, options = {}) {
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
      saved INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'captured',
      version_count INTEGER NOT NULL DEFAULT 0, edit_count INTEGER NOT NULL DEFAULT 0
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
  const messageColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map(c => c.name));
  const addedColumns = { status: "TEXT NOT NULL DEFAULT 'captured'", version_count: 'INTEGER NOT NULL DEFAULT 0', edit_count: 'INTEGER NOT NULL DEFAULT 0' };
  if (Object.keys(addedColumns).some(name => !messageColumns.has(name))) {
    db.exec('BEGIN IMMEDIATE');
    try {
      // Another process may have finished migrating while we waited for the lock.
      const currentColumns = new Set(db.prepare('PRAGMA table_info(messages)').all().map(c => c.name));
      for (const [name, definition] of Object.entries(addedColumns)) if (!currentColumns.has(name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${definition}`);
      // Existing encrypted payloads need no decryption or rewrite to migrate.
      db.exec(`UPDATE messages SET
        version_count=(SELECT count(*) FROM events WHERE message_id=messages.id AND kind!='delete'),
        edit_count=(SELECT count(*) FROM events WHERE message_id=messages.id AND kind='edit'),
        status=CASE WHEN EXISTS(SELECT 1 FROM events WHERE message_id=messages.id AND kind='delete') THEN 'deleted'
          WHEN EXISTS(SELECT 1 FROM events WHERE message_id=messages.id AND kind='edit') THEN 'edited' ELSE 'captured' END;
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS messages_page ON messages(user_id,last_seen DESC,id);
    CREATE INDEX IF NOT EXISTS messages_platform_page ON messages(user_id,platform,last_seen DESC,id);
    CREATE INDEX IF NOT EXISTS messages_status_page ON messages(user_id,status,last_seen DESC,id);
    CREATE INDEX IF NOT EXISTS messages_scan ON messages(user_id,id);
    CREATE INDEX IF NOT EXISTS messages_connection ON messages(connection_id,last_seen DESC);
    CREATE INDEX IF NOT EXISTS messages_retention ON messages(user_id,first_seen);
    CREATE INDEX IF NOT EXISTS events_history ON events(message_id,occurred_at,CASE kind WHEN 'create' THEN 0 WHEN 'edit' THEN 1 ELSE 2 END,id);`);
  const reader = createArchiveReader(db, crypt);
  db.exec(`CREATE TABLE IF NOT EXISTS forgotten (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'recovery_hash')) db.exec('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
  if (!db.prepare('PRAGMA table_info(connections)').all().some(c => c.name === 'paired_at')) db.exec('ALTER TABLE connections ADD COLUMN paired_at TEXT');
  if (!db.prepare('PRAGMA table_info(connections)').all().some(c => c.name === 'collector')) db.exec('ALTER TABLE connections ADD COLUMN collector TEXT');
  if (!db.prepare('PRAGMA table_info(connections)').all().some(c => c.name === 'connected_at')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('PRAGMA table_info(connections)').all().some(c => c.name === 'connected_at')) {
        db.exec(`ALTER TABLE connections ADD COLUMN connected_at TEXT;
          UPDATE connections SET connected_at=coalesce((SELECT min(first_seen) FROM messages WHERE connection_id=connections.id),last_seen,created_at)
          WHERE health='connected' OR EXISTS(SELECT 1 FROM messages WHERE connection_id=connections.id);`);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS connection_first_connected AFTER UPDATE OF health ON connections
    WHEN NEW.health='connected' AND NEW.connected_at IS NULL BEGIN
      UPDATE connections SET connected_at=coalesce(NEW.last_seen,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=NEW.id;
    END;`);
  db.exec(`CREATE TABLE IF NOT EXISTS pairing_codes (
    connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS hosted_collectors (
    connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,
    config TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
  );`);
  const capacity = createArchiveCapacity(db, path, options);
  const getUser = id => db.prepare('SELECT id,username,created_at,retention_days,recovery_hash IS NOT NULL AS recovery_enabled FROM users WHERE id=?').get(id);
  const connections = user => db.prepare(`SELECT id,platform,name,created_at,last_seen,paused,revoked,health,detail,queued,paired_at,collector,capacity_reason,
    (SELECT count(*) FROM messages WHERE connection_id=connections.id) AS message_count,
    (SELECT max(last_seen) FROM messages WHERE connection_id=connections.id) AS last_message_at
    FROM connections WHERE user_id=? ORDER BY created_at`).all(user);
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
    if (Date.parse(e.occurredAt) > Date.now() + 5 * 60_000) throw Object.assign(new Error('Event timestamp is in the future.'), { permanent: true });
    if (connection.revoked) throw Object.assign(new Error('Connection revoked.'), { permanent: true });
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
      const payload = crypt.seal(e, `${connection.user_id}:${id}:${uid}`), bytes = eventBytes(payload, uid);
      const existing = db.prepare('SELECT 1 FROM messages WHERE id=?').get(id);
      capacity.assertRoom(connection.user_id, bytes + (existing ? 0 : MESSAGE_BYTES));
      db.prepare(`INSERT INTO messages (id,user_id,connection_id,platform,first_seen,last_seen) VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen`).run(id, connection.user_id, connection.id, connection.platform, now, now);
      db.prepare('INSERT INTO events (message_id,connection_id,event_uid,kind,occurred_at,received_at,payload,user_id,storage_bytes) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, connection.id, uid, e.kind, e.occurredAt, now, payload, connection.user_id, bytes);
      db.prepare(`UPDATE messages SET version_count=version_count+?,edit_count=edit_count+?,
        status=CASE WHEN status='deleted' OR ?='delete' THEN 'deleted'
          WHEN status='edited' OR ?='edit' THEN 'edited' ELSE 'captured' END WHERE id=?`)
        .run(+(e.kind !== 'delete'), +(e.kind === 'edit'), e.kind, e.kind, id);
      db.exec('COMMIT');
      return { id, duplicate: false };
    } catch (error) { db.exec('ROLLBACK'); if (error.capacity) capacity.block(connection.id, error); throw error; }
  }
  // Expired messages are removed in small indexed batches so a large retention
  // boundary cannot stall the single event loop for the whole delete. Each batch
  // records its suppression markers and deletes atomically. A budget lets request
  // handlers do bounded work; the hourly timer runs without one.
  const expiredBatch = 'SELECT id FROM messages WHERE user_id=? AND first_seen<? ORDER BY first_seen LIMIT 500';
  function purge({ budgetMs = Infinity } = {}) {
    const started = Date.now();
    let complete = true;
    for (const u of db.prepare('SELECT id,retention_days FROM users WHERE retention_days > 0').all()) {
      const cutoff = new Date(started - u.retention_days * 86400_000).toISOString();
      while (true) {
        if (Date.now() - started > budgetMs) { complete = false; break; }
        db.exec('BEGIN IMMEDIATE');
        let removed;
        try {
          db.prepare(`INSERT OR IGNORE INTO forgotten (id,user_id) SELECT id,user_id FROM messages WHERE id IN (${expiredBatch})`).run(u.id, cutoff);
          removed = db.prepare(`DELETE FROM messages WHERE id IN (${expiredBatch})`).run(u.id, cutoff).changes;
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        if (removed < 500) break;
      }
      if (!complete) break;
    }
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(new Date().toISOString());
    return complete;
  }
  return { db, getUser, connections, ingest, purge, ...reader, capacity,
    createRecoveryKey(userId) {
      const secret = `awr_${token()}`;
      db.prepare('UPDATE users SET recovery_hash=? WHERE id=?').run(hash(secret), userId);
      return secret;
    },
    async recoverAccount(username, recoveryKey, password) {
      const user = db.prepare('SELECT id,recovery_hash FROM users WHERE username=?').get(username.toLowerCase());
      if (!user?.recovery_hash || hash(recoveryKey) !== user.recovery_hash) return null;
      const encoded = await passwordHash(password), replacement = `awr_${token()}`;
      // Conditional update consumes the old key once even during concurrent resets.
      const result = db.prepare('UPDATE users SET password=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(encoded, hash(replacement), user.id, user.recovery_hash);
      if (!result.changes) return null;
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      return { user: getUser(user.id), recoveryKey: replacement };
    },
    hostedConfig(id) {
      const row = db.prepare('SELECT config FROM hosted_collectors WHERE connection_id=?').get(id);
      return row ? crypt.open(row.config, `collector:${id}`) : {};
    },
    saveHostedConfig(id, config) {
      db.prepare(`INSERT INTO hosted_collectors (connection_id,config,updated_at) VALUES (?,?,?)
        ON CONFLICT(connection_id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at`)
        .run(id, crypt.seal(config, `collector:${id}`), new Date().toISOString());
    },
    hostedConnections() {
      return db.prepare(`SELECT c.*,h.enabled FROM hosted_collectors h JOIN connections c ON c.id=h.connection_id WHERE c.revoked=0 AND c.collector='hosted'`).all();
    },
    createPairing(connectionId, userId) {
      const connection = db.prepare("SELECT id FROM connections WHERE id=? AND user_id=? AND revoked=0 AND (collector IS NULL OR collector!='hosted')").get(connectionId, userId);
      if (!connection) return null;
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      // Ten independent symbols from a 32-character alphabet: 50 bits of entropy.
      const code = [...randomBytes(10)].map(b => alphabet[b & 31]).join('');
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      db.prepare(`INSERT INTO pairing_codes VALUES (?,?,?,?) ON CONFLICT(connection_id)
        DO UPDATE SET code_hash=excluded.code_hash,created_at=excluded.created_at,expires_at=excluded.expires_at`).run(connectionId, hash(code), createdAt, expiresAt);
      return { code: `${code.slice(0, 5)}-${code.slice(5)}`, createdAt, expiresAt };
    },
    redeemPairing(input, expectedPlatform) {
      const code = String(input).replace(/[\s-]/g, '').toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) return null;
      db.exec('BEGIN IMMEDIATE');
      try {
        const c = db.prepare(`SELECT c.* FROM pairing_codes p JOIN connections c ON p.connection_id=c.id
          WHERE p.code_hash=? AND p.expires_at>? AND c.revoked=0`).get(hash(code), new Date().toISOString());
        if (!c || expectedPlatform && c.platform !== expectedPlatform || c.platform === 'discord' && expectedPlatform !== 'discord') { db.exec('COMMIT'); return null; }
        const secret = `aw_${token()}`, pairedAt = new Date().toISOString();
        const collector = c.platform === 'discord' ? 'discord-browser' : 'companion';
        db.prepare("UPDATE connections SET token_hash=?,paired_at=?,last_seen=?,collector=?,health='waiting',connected_at=NULL,detail=? WHERE id=?")
          .run(hash(secret), pairedAt, pairedAt, collector, c.platform === 'discord' ? 'Extension paired. Start capture in your Discord Web tab.' : 'Companion paired. Finish signing in on your computer.', c.id);
        db.prepare('DELETE FROM pairing_codes WHERE connection_id=?').run(c.id);
        db.exec('COMMIT');
        return { token: secret, platform: c.platform, collector, connectionId: c.id, name: c.name, profile: `${c.platform}-${c.id.slice(0, 8)}` };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
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
