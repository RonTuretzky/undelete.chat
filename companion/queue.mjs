import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { cipher } from '../server/crypto.mjs';
export function openQueue(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, 'queue.key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  const crypt = cipher(readFileSync(keyPath, 'utf8').trim());
  const db = new DatabaseSync(join(directory, 'queue.sqlite'));
  chmodSync(join(directory, 'queue.sqlite'), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT UNIQUE, payload TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  return {
    add(event) { db.prepare('INSERT OR IGNORE INTO queue (uid,payload) VALUES (?,?)').run(event.eventId, crypt.seal(event, event.eventId)); },
    pending() { return db.prepare('SELECT uid,payload FROM queue WHERE error IS NULL ORDER BY id LIMIT 50').all().map(r => crypt.open(r.payload, r.uid)); },
    count() { return db.prepare('SELECT count(*) n FROM queue WHERE error IS NULL').get().n; },
    rejected() { return db.prepare('SELECT count(*) n FROM queue WHERE error IS NOT NULL').get().n; },
    ack(uid) { db.prepare('DELETE FROM queue WHERE uid=?').run(uid); },
    reject(uid, error) { db.prepare('UPDATE queue SET error=? WHERE uid=?').run(error, uid); },
    get(key) { const r = db.prepare('SELECT value FROM metadata WHERE key=?').get(key); return r ? crypt.open(r.value, key) : undefined; },
    set(key, value) { db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, crypt.seal(value, key)); },
    delete(key) { db.prepare('DELETE FROM metadata WHERE key=?').run(key); },
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
  for (const result of results || []) {
    if (!sent.has(result.eventId)) continue;
    if (result.error) queue.reject(result.eventId, result.error);
    else if (result.id || result.ignored || result.duplicate) queue.ack(result.eventId);
  }
  return events.length;
}
