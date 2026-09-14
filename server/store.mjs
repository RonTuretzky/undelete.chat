import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { cipher, hash, token, passwordHash } from './crypto.mjs';
import { createArchiveReader } from './archive-reader.mjs';
import { createArchiveCapacity, eventBytes, MESSAGE_BYTES } from './archive-capacity.mjs';
import { resolveWatch, mergeWatch, defaultWatch } from './watch.mjs';

export const platforms = ['telegram', 'signal', 'whatsapp'];
const short = z.string().min(1).max(256);
export const eventSchema = z.object({
  eventId: short, kind: z.enum(['create', 'edit', 'delete']), externalId: short,
  scope: short, chatId: z.string().max(256).default(''), chatName: z.string().max(500).default(''),
  authorId: z.string().max(256).default(''), authorName: z.string().max(500).default(''),
  text: z.string().max(100_000).optional(), occurredAt: z.iso.datetime(),
  ephemeral: z.boolean().default(false),
  // Sent in a chat with a disappearing-messages timer. Held and kept like any other message; shown with a tag.
  disappearing: z.boolean().default(false),
  attachments: z.array(z.object({ name: z.string().max(500), type: z.string().max(100).default('file'), size: z.number().nonnegative().optional() })).max(50).default([])
}).refine(e => e.kind === 'delete' || e.text !== undefined || e.attachments.length > 0, 'Message content is required.');

export function createStore(path, encryptionKey, options = {}) {
  const db = new DatabaseSync(path);
  const crypt = cipher(encryptionKey);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA journal_size_limit=67108864;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      created_at TEXT NOT NULL, retention_days INTEGER NOT NULL DEFAULT 0
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
  const addedColumns = { status: "TEXT NOT NULL DEFAULT 'captured'", version_count: 'INTEGER NOT NULL DEFAULT 0', edit_count: 'INTEGER NOT NULL DEFAULT 0', held: 'INTEGER NOT NULL DEFAULT 0' };
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
    CREATE INDEX IF NOT EXISTS messages_held ON messages(user_id,held,last_seen);
    CREATE INDEX IF NOT EXISTS events_history ON events(message_id,occurred_at,CASE kind WHEN 'create' THEN 0 WHEN 'edit' THEN 1 ELSE 2 END,id);`);
  const reader = createArchiveReader(db, crypt);
  db.exec(`CREATE TABLE IF NOT EXISTS forgotten (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'recovery_hash')) db.exec('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  for (const [name, definition] of Object.entries({ billing_customer_id: 'TEXT', billing_subscription_id: 'TEXT', billing_status: 'TEXT', billing_period_end: 'TEXT',
    billing_cancel_at_period_end: 'INTEGER NOT NULL DEFAULT 0', billing_updated_at: 'TEXT', trial_ends_at: 'TEXT' })) if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_billing_customer ON users(billing_customer_id) WHERE billing_customer_id IS NOT NULL');
  db.exec('CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, received_at TEXT NOT NULL)');
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT, failures INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS push_subscriptions_owner ON push_subscriptions(user_id);
  CREATE TABLE IF NOT EXISTS native_push_tokens (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, platform TEXT NOT NULL,
    created_at TEXT NOT NULL, last_used_at TEXT, failures INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS native_push_tokens_owner ON native_push_tokens(user_id);`);
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'hold_days')) db.exec('ALTER TABLE users ADD COLUMN hold_days INTEGER NOT NULL DEFAULT 3');
  // One-time default changes for accounts created before September 12, 2026:
  // deleted messages are kept until removed, and the watch window is three days
  // (covering WhatsApp's two-day and Signal's one-day deletion limits).
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  if (!db.prepare("SELECT 1 FROM migrations WHERE name='defaults-2026-09-12'").get()) {
    db.prepare('UPDATE users SET retention_days=0 WHERE retention_days=90').run();
    db.prepare('UPDATE users SET hold_days=3 WHERE hold_days IN (1,7)').run();
    db.prepare('INSERT INTO migrations (name,applied_at) VALUES (?,?)').run('defaults-2026-09-12', new Date().toISOString());
  }
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'last_active_at')) db.exec('ALTER TABLE users ADD COLUMN last_active_at TEXT');
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'watch_config')) db.exec('ALTER TABLE users ADD COLUMN watch_config TEXT');
  // Only deleted messages belong to the archive. Anything else is a held
  // message in the watch buffer; this also converts pre-existing archives.
  db.prepare("UPDATE messages SET held=1 WHERE status!='deleted' AND held=0").run();
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
  // Sign-ins that expired before ever linking are retired at startup as well.
  db.prepare("DELETE FROM hosted_collectors WHERE connection_id IN (SELECT id FROM connections WHERE collector='hosted' AND connected_at IS NULL AND health='error' AND detail LIKE 'Sign-in%')").run();
  db.prepare("UPDATE connections SET revoked=1,token_hash=NULL,detail='Sign-in expired before the account was linked.' WHERE collector='hosted' AND revoked=0 AND connected_at IS NULL AND health='error' AND detail LIKE 'Sign-in%'").run();
  // Discord support was withdrawn; retire any remaining sources so nothing tries to run them.
  db.prepare("DELETE FROM hosted_collectors WHERE connection_id IN (SELECT id FROM connections WHERE platform='discord')").run();
  db.prepare("UPDATE connections SET revoked=1,token_hash=NULL,health='error',detail='Discord is no longer supported.' WHERE platform='discord' AND revoked=0").run();
  const capacity = createArchiveCapacity(db, path, options);
  const hooks = {};
  const getUser = id => { const row = db.prepare('SELECT id,username,created_at,retention_days,watch_config,recovery_hash IS NOT NULL AS recovery_enabled FROM users WHERE id=?').get(id); if (!row) return row; const { watch_config, ...user } = row; return { ...user, watch: resolveWatch(watch_config) }; };
  const connections = user => db.prepare(`SELECT id,platform,name,created_at,last_seen,connected_at,paused,revoked,health,detail,queued,paired_at,collector,capacity_reason,
    (SELECT count(*) FROM messages WHERE connection_id=connections.id AND held=0) AS message_count,
    (SELECT count(*) FROM messages WHERE connection_id=connections.id AND held=1) AS held_count,
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
      held: !!row.held, saved: !!row.saved, status: deleted ? 'deleted' : edited ? 'edited' : 'captured',
      authorName: meta?.authorName || 'Unknown sender', authorId: meta?.authorId || '', chatName: meta?.chatName || meta?.chatId || 'Unknown conversation',
      externalId: meta?.externalId || '', text: last?.text ?? '', attachments: last?.attachments || [],
      originalMissing: !versions.some(v => v.kind === 'create'), versionCount: contents.length, versions };
  }
  function ingest(connection, input) {
    const e = eventSchema.parse(input);
    // Platforms stamp messages with the sender's clock, which can run ahead. A
    // skewed clock does not make a message invalid: clamp it to now instead.
    if (Date.parse(e.occurredAt) > Date.now()) e.occurredAt = new Date().toISOString();
    if (connection.revoked) throw Object.assign(new Error('Connection revoked.'), { permanent: true });
    if (connection.paused || e.ephemeral) return { ignored: true, reason: e.ephemeral ? 'ephemeral' : 'paused' };
    const id = hash(`${connection.id}:${e.scope}:${e.externalId}`);
    const uid = e.eventId;
    const now = new Date().toISOString();
    // One transaction prevents a crash from leaving a message without its event,
    // and keeps the suppression check atomic with the insert.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT 1 FROM forgotten WHERE id=?').get(id)) { db.exec('COMMIT'); return { ignored: true, reason: 'removed' }; }
      if (db.prepare('SELECT 1 FROM events WHERE connection_id=? AND event_uid=?').get(connection.id, uid)) {
        db.exec('COMMIT'); return { duplicate: true, id };
      }
      const existing = db.prepare('SELECT held FROM messages WHERE id=?').get(id);
      if (e.kind === 'edit' && existing) {
        const row = db.prepare('SELECT held,first_seen FROM messages WHERE id=?').get(id);
        if (row?.held) {
          const watch = resolveWatch(db.prepare('SELECT watch_config FROM users WHERE id=?').get(connection.user_id)?.watch_config);
          const editHours = (watch[connection.platform] || defaultWatch.telegram).editHours;
          if (Date.parse(e.occurredAt) - Date.parse(row.first_seen) > editHours * 3600_000) { db.exec('COMMIT'); return { ignored: true, reason: 'edit_window_closed', id }; }
        }
        // Platforms also report reactions, link previews, pins, and formatting
        // as edits. A version whose text and attachments match the current one
        // carries no new content, so it is acknowledged without being recorded.
        const latest = db.prepare('SELECT event_uid,kind,payload FROM events WHERE message_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1').get(id);
        if (latest && latest.kind !== 'delete') {
          const current = crypt.open(latest.payload, `${connection.user_id}:${id}:${latest.event_uid}`);
          if ((current.text ?? '') === (e.text ?? '') && JSON.stringify(current.attachments || []) === JSON.stringify(e.attachments || [])) {
            db.exec('COMMIT'); return { ignored: true, reason: 'unchanged', id };
          }
        }
      }
      const payload = crypt.seal(e, `${connection.user_id}:${id}:${uid}`), bytes = eventBytes(payload, uid);
      capacity.assertRoom(connection.user_id, bytes + (existing ? 0 : MESSAGE_BYTES));
      // A message enters the archive only when the platform deletes it. Until
      // then it is held privately and discarded after the owner's watch window.
      db.prepare(`INSERT INTO messages (id,user_id,connection_id,platform,first_seen,last_seen,held) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,held=CASE WHEN excluded.held=0 THEN 0 ELSE messages.held END`)
        .run(id, connection.user_id, connection.id, connection.platform, now, now, e.kind === 'delete' ? 0 : 1);
      db.prepare('INSERT INTO events (message_id,connection_id,event_uid,kind,occurred_at,received_at,payload,user_id,storage_bytes) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, connection.id, uid, e.kind, e.occurredAt, now, payload, connection.user_id, bytes);
      db.prepare(`UPDATE messages SET version_count=version_count+?,edit_count=edit_count+?,
        status=CASE WHEN status='deleted' OR ?='delete' THEN 'deleted'
          WHEN status='edited' OR ?='edit' THEN 'edited' ELSE 'captured' END WHERE id=?`)
        .run(+(e.kind !== 'delete'), +(e.kind === 'edit'), e.kind, e.kind, id);
      db.exec('COMMIT');
      // A deletion that moves a message into the archive (or records a fresh
      // tombstone) is a recovery worth telling the owner about.
      if (e.kind === 'delete' && (!existing || existing.held)) { try { hooks.recovered?.(connection.user_id, connection.platform); } catch { /* Notifications never affect ingest. */ } }
      return { id, duplicate: false, held: e.kind !== 'delete' && !!db.prepare('SELECT held FROM messages WHERE id=?').get(id).held };
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
    // Held messages that were never deleted leave the watch buffer without a
    // suppression marker: a later deletion may still arrive as a tombstone.
    const heldBatch = 'SELECT id FROM messages WHERE user_id=? AND platform=? AND held=1 AND last_seen<? ORDER BY last_seen LIMIT 500';
    for (const u of db.prepare('SELECT id,watch_config FROM users').all()) {
      const watch = resolveWatch(u.watch_config);
      for (const [platform, window] of Object.entries(watch)) {
        const cutoff = new Date(started - window.deleteHours * 3600_000).toISOString();
        while (true) {
          if (Date.now() - started > budgetMs) { complete = false; break; }
          if (db.prepare(`DELETE FROM messages WHERE id IN (${heldBatch})`).run(u.id, platform, cutoff).changes < 500) break;
        }
        if (!complete) break;
      }
      if (!complete) break;
    }
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(new Date().toISOString());
    // secure_delete overwrites pages in the main file; truncating the WAL drops
    // the pre-delete page images it would otherwise keep until reuse.
    if (complete) try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* Busy readers; the next pass truncates. */ }
    return complete;
  }
  return { db, getUser, connections, ingest, purge, ...reader, capacity, hooks,
    pushSubscriptions(userId) { return db.prepare('SELECT endpoint,p256dh,auth,created_at,last_used_at FROM push_subscriptions WHERE user_id=? ORDER BY created_at').all(userId); },
    addPushSubscription(userId, subscription) {
      db.prepare(`INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,created_at) VALUES (?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,failures=0`)
        .run(subscription.endpoint, userId, subscription.keys.p256dh, subscription.keys.auth, new Date().toISOString());
      // A device holds at most a handful of subscriptions; keep the newest ten per account.
      db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 10)').run(userId, userId);
    },
    nativePushTokens(userId) { return db.prepare('SELECT token,platform,created_at,last_used_at FROM native_push_tokens WHERE user_id=? ORDER BY created_at').all(userId); },
    addNativePushToken(userId, platform, token) {
      db.prepare(`INSERT INTO native_push_tokens (token,user_id,platform,created_at) VALUES (?,?,?,?)
        ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,failures=0`).run(token, userId, platform, new Date().toISOString());
      db.prepare('DELETE FROM native_push_tokens WHERE user_id=? AND token NOT IN (SELECT token FROM native_push_tokens WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 10)').run(userId, userId);
    },
    removeNativePushToken(userId, token) { return db.prepare('DELETE FROM native_push_tokens WHERE user_id=? AND token=?').run(userId, token).changes; },
    dropNativePushToken(token) { db.prepare('DELETE FROM native_push_tokens WHERE token=?').run(token); },
    touchNativePushToken(token) { db.prepare('UPDATE native_push_tokens SET last_used_at=?,failures=0 WHERE token=?').run(new Date().toISOString(), token); },
    failNativePushToken(token) { db.prepare('UPDATE native_push_tokens SET failures=failures+1 WHERE token=?').run(token); db.prepare('DELETE FROM native_push_tokens WHERE token=? AND failures>=20').run(token); },
    removePushSubscription(userId, endpoint) { return db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(userId, endpoint).changes; },
    dropPushSubscription(endpoint) { db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint); },
    touchPushSubscription(endpoint) { db.prepare('UPDATE push_subscriptions SET last_used_at=?,failures=0 WHERE endpoint=?').run(new Date().toISOString(), endpoint); },
    failPushSubscription(endpoint) { db.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint=?').run(endpoint); db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND failures>=20').run(endpoint); },
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
        if (!c || expectedPlatform && c.platform !== expectedPlatform) { db.exec('COMMIT'); return null; }
        const secret = `aw_${token()}`, pairedAt = new Date().toISOString();
        const collector = 'companion';
        db.prepare("UPDATE connections SET token_hash=?,paired_at=?,last_seen=?,collector=?,health='waiting',connected_at=NULL,detail=? WHERE id=?")
          .run(hash(secret), pairedAt, pairedAt, collector, 'Companion paired. Finish signing in on your computer.', c.id);
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
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* Busy readers; the hourly purge truncates. */ }
    },
    async createUser(username, password) {
      const id = randomUUID();
      db.prepare('INSERT INTO users (id,username,password,created_at) VALUES (?,?,?,?)').run(id, username.toLowerCase(), await passwordHash(password), new Date().toISOString());
      return getUser(id);
    },
    userByName(name) { return db.prepare('SELECT * FROM users WHERE username=?').get(name.toLowerCase()); },
    billingRecord(userId) {
      return db.prepare('SELECT id,username,created_at,billing_customer_id,billing_subscription_id,billing_status,billing_period_end,billing_cancel_at_period_end,trial_ends_at FROM users WHERE id=?').get(userId) || null;
    },
    userByCustomer(customerId) {
      const row = db.prepare('SELECT id FROM users WHERE billing_customer_id=?').get(customerId);
      return row ? this.billingRecord(row.id) : null;
    },
    recordBillingEvent(id, type) {
      const inserted = db.prepare('INSERT OR IGNORE INTO billing_events (id,type,received_at) VALUES (?,?,?)').run(id, String(type).slice(0, 80), new Date().toISOString()).changes;
      db.prepare('DELETE FROM billing_events WHERE received_at < ?').run(new Date(Date.now() - 30 * 86400_000).toISOString());
      return inserted === 1;
    },
    startTrial(userId, endsAt) { db.prepare('UPDATE users SET trial_ends_at=? WHERE id=? AND trial_ends_at IS NULL').run(endsAt, userId); },
    setBillingCustomer(userId, customerId) {
      if (typeof customerId !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(customerId)) throw new Error('Invalid billing customer identifier.');
      db.prepare('UPDATE users SET billing_customer_id=?,billing_updated_at=? WHERE id=?').run(customerId, new Date().toISOString(), userId);
    },
    applySubscription(userId, { customerId, subscriptionId, status, periodEnd, cancelAtPeriodEnd }) {
      if (typeof subscriptionId !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error('Invalid subscription identifier.');
      if (typeof status !== 'string' || !/^[a-z_]{1,32}$/.test(status)) throw new Error('Invalid subscription status.');
      if (customerId !== undefined && customerId !== null && !/^cus_[A-Za-z0-9]+$/.test(String(customerId))) throw new Error('Invalid billing customer identifier.');
      db.prepare(`UPDATE users SET billing_customer_id=coalesce(?,billing_customer_id),billing_subscription_id=?,billing_status=?,billing_period_end=?,billing_cancel_at_period_end=?,billing_updated_at=? WHERE id=?`)
        .run(customerId || null, subscriptionId, status, periodEnd || null, cancelAtPeriodEnd ? 1 : 0, new Date().toISOString(), userId);
    },
    session(userId) {
      const secret = token();
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(secret), userId, new Date(Date.now() + 30 * 86400_000).toISOString());
      return secret;
    },
    authenticate(secret) {
      if (!secret) return null;
      const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(secret), new Date().toISOString());
      if (!row) return null;
      // Activity is recorded to the hour; it drives the dormant-workspace policy only.
      db.prepare("UPDATE users SET last_active_at=? WHERE id=? AND (last_active_at IS NULL OR last_active_at < ?)").run(new Date().toISOString(), row.user_id, new Date(Date.now() - 3600_000).toISOString());
      return getUser(row.user_id);
    },
    setWatch(userId, patch) { db.prepare('UPDATE users SET watch_config=? WHERE id=?').run(JSON.stringify(mergeWatch(db.prepare('SELECT watch_config FROM users WHERE id=?').get(userId)?.watch_config, patch)), userId); },
    touch(userId) { db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(new Date().toISOString(), userId); },
    dormantUsers(days) {
      if (!Number.isFinite(days) || days <= 0) return [];
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      // A workspace is dormant when nobody has signed in for the period and no
      // subscription is active, trialing, or past due. Activity before the column
      // existed counts from the account's creation date.
      return db.prepare(`SELECT id,username FROM users WHERE coalesce(last_active_at,created_at) < ?
        AND (billing_status IS NULL OR billing_status NOT IN ('active','trialing','past_due')) ORDER BY coalesce(last_active_at,created_at) LIMIT 50`).all(cutoff);
    },
    deleteAccount(userId) {
      const ids = db.prepare('SELECT id FROM connections WHERE user_id=?').all(userId).map(c => c.id);
      db.prepare('UPDATE connections SET revoked=1,token_hash=NULL WHERE user_id=?').run(userId);
      return ids;
    },
    eraseAccount(userId) { db.prepare('DELETE FROM users WHERE id=?').run(userId); },
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
