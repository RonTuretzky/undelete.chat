import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { cipher } from '../server/crypto.mjs';
import { capacityError, freeBytes, MiB, positiveBytes } from '../server/capacity.mjs';
export function openQueue(directory, encryptionKey, options = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, 'queue.key');
  if (!encryptionKey && !existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  const crypt = cipher(encryptionKey || readFileSync(keyPath, 'utf8').trim());
  const db = new DatabaseSync(join(directory, 'queue.sqlite'));
  chmodSync(join(directory, 'queue.sqlite'), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT UNIQUE, payload TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  if (!db.prepare('PRAGMA table_info(metadata)').all().some(c => c.name === 'updated_at')) db.exec('ALTER TABLE metadata ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(queue)').all().some(c => c.name === 'queued_at')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('PRAGMA table_info(queue)').all().some(c => c.name === 'queued_at')) db.exec('ALTER TABLE queue ADD COLUMN queued_at INTEGER NOT NULL DEFAULT 0');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  const eventLimit = positiveBytes(options.eventLimitBytes, 32 * MiB, 'Queue event limit');
  const metadataLimit = positiveBytes(options.metadataLimitBytes, 32 * MiB, 'Queue metadata limit');
  const minimumFree = options.minimumFreeBytes ?? 64 * MiB;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='queue_usage'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='queue_usage'").get()) {
        db.exec('CREATE TABLE queue_usage (kind TEXT PRIMARY KEY, used_bytes INTEGER NOT NULL);');
        for (const [table, key, value] of [['queue', 'uid', 'payload'], ['metadata', 'key', 'value']]) {
          const size = row => `length(CAST(${row ? row + '.' : ''}${value} AS BLOB))+2*length(CAST(${row ? row + '.' : ''}${key} AS BLOB))+512`;
          db.exec(`INSERT INTO queue_usage SELECT '${table}',coalesce(sum(${size('')}),0) FROM ${table};`);
          for (const [action, amount] of [['INSERT', `+(${size('NEW')})`], ['DELETE', `-(${size('OLD')})`], ['UPDATE', `+(${size('NEW')})-(${size('OLD')})`]]) {
            db.exec(`CREATE TRIGGER ${table}_bytes_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
              UPDATE queue_usage SET used_bytes=used_bytes${amount} WHERE kind='${table}'; END;`);
          }
        }
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.exec('CREATE INDEX IF NOT EXISTS queue_pending ON queue(error,id);');
  const size = (key, payload) => Buffer.byteLength(payload) + 2 * Buffer.byteLength(key) + 512;
  function check(kind, additional) {
    if (additional <= 0) return;
    const limit = kind === 'queue' ? eventLimit : metadataLimit;
    const used = db.prepare('SELECT used_bytes FROM queue_usage WHERE kind=?').get(kind).used_bytes;
    if (used + additional > limit || minimumFree && (options.freeBytes || (() => freeBytes(directory)))() < minimumFree + additional) throw capacityError('collector_capacity');
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return {
    add(event) { return transaction(() => {
      if (db.prepare('SELECT 1 FROM queue WHERE uid=?').get(event.eventId)) return;
      const payload = crypt.seal(event, event.eventId); check('queue', size(event.eventId, payload));
      db.prepare('INSERT INTO queue (uid,payload,queued_at) VALUES (?,?,?)').run(event.eventId, payload, Date.now());
    }); },
    pending() {
      const events = []; let bytes = 0;
      for (const row of db.prepare('SELECT uid,payload FROM queue WHERE error IS NULL ORDER BY id LIMIT 50').all()) {
        const event = crypt.open(row.payload, row.uid), length = Buffer.byteLength(JSON.stringify(event));
        if (bytes + length > 1_500_000 && events.length) break;
        events.push(event); bytes += length;
      }
      return events;
    },
    count() { return db.prepare('SELECT count(*) n FROM queue WHERE error IS NULL').get().n; },
    rejected() { return db.prepare('SELECT count(*) n FROM queue WHERE error IS NOT NULL').get().n; },
    ack(uid) { db.prepare('DELETE FROM queue WHERE uid=?').run(uid); },
    reject(uid, error) { db.prepare('UPDATE queue SET error=? WHERE uid=?').run(error, uid); },
    get(key) { const r = db.prepare('SELECT value FROM metadata WHERE key=?').get(key); return r ? crypt.open(r.value, key) : undefined; },
    set(key, value) { return transaction(() => {
      const payload = crypt.seal(value, key), old = db.prepare('SELECT value FROM metadata WHERE key=?').get(key);
      check('metadata', size(key, payload) - (old ? size(key, old.value) : 0));
      db.prepare('INSERT INTO metadata (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key, payload, Date.now());
    }); },
    usage() { return Object.fromEntries(db.prepare('SELECT kind,used_bytes FROM queue_usage').all().map(row => [row.kind, row.used_bytes])); },
    delete(key) { db.prepare('DELETE FROM metadata WHERE key=?').run(key); },
    clearPrefix(prefix) { db.prepare('DELETE FROM metadata WHERE substr(key,1,length(?))=?').run(prefix, prefix); },
    prunePrefix(prefix, before) { db.prepare('DELETE FROM metadata WHERE substr(key,1,length(?))=? AND updated_at<?').run(prefix, prefix, before); },
    close() { db.close(); }
  };
}
export const eventId = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const timestamp = value => { const n = Number(value); return new Date(n < 1e12 ? n * 1000 : n).toISOString(); };

export async function deliverBatch({ queue, server, token, fetcher = fetch }) {
  const events = queue.pending();
  if (!events.length) return 0;
  const response = await fetcher(`${server}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ events }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) { const error = new Error(`Archive responded ${response.status}`); error.status = response.status; throw error; }
  const { results } = await response.json();
  const sent = new Set(events.map(e => e.eventId));
  let retry;
  for (const result of results || []) {
    if (!sent.has(result.eventId)) continue;
    if (result.error && result.retryable) retry ||= result;
    else if (result.error) queue.reject(result.eventId, result.error);
    else if (result.id || result.ignored || result.duplicate) queue.ack(result.eventId);
  }
  if (retry) throw Object.assign(new Error(retry.error), { retryable: true, code: retry.code, capacity: ['archive_quota', 'server_capacity', 'disk_capacity'].includes(retry.code) });
  return events.length;
}
