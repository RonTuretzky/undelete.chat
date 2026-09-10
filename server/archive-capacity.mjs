import { dirname, resolve } from 'node:path';
import { capacityError, capacityMessages, freeBytes, MiB, positiveBytes } from './capacity.mjs';

export const MESSAGE_BYTES = 1536, FORGOTTEN_BYTES = 512;
export const eventBytes = (payload, uid) => Buffer.byteLength(payload) + 2 * Buffer.byteLength(uid) + 768;

export function createArchiveCapacity(db, path, options = {}) {
  const accountLimit = positiveBytes(options.accountLimitBytes, 128 * MiB, 'Archive account limit');
  const serverLimit = positiveBytes(options.serverLimitBytes, 1024 * MiB, 'Archive server limit');
  const minimumFree = options.minimumFreeBytes ?? 0;
  if (!Number.isSafeInteger(minimumFree) || minimumFree < 0) throw new Error('Minimum free bytes must be a nonnegative integer.');
  const available = options.freeBytes || (() => path === ':memory:' ? Infinity : freeBytes(dirname(resolve(path))));
  const columns = () => new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));
  if (!columns().has('archive_bytes')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!columns().has('archive_bytes')) {
        db.exec(`ALTER TABLE users ADD COLUMN archive_bytes INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE users ADD COLUMN archive_limit_bytes INTEGER;
          ALTER TABLE events ADD COLUMN user_id TEXT;
          ALTER TABLE events ADD COLUMN storage_bytes INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE connections ADD COLUMN capacity_reason TEXT;
          ALTER TABLE connections ADD COLUMN capacity_required INTEGER NOT NULL DEFAULT 0;
          UPDATE events SET user_id=(SELECT user_id FROM messages WHERE id=events.message_id),
            storage_bytes=length(CAST(payload AS BLOB))+2*length(CAST(event_uid AS BLOB))+768;
          CREATE TABLE archive_usage (id INTEGER PRIMARY KEY CHECK(id=1), used_bytes INTEGER NOT NULL);
          UPDATE users SET archive_bytes=
            coalesce((SELECT sum(storage_bytes) FROM events WHERE user_id=users.id),0)
            +${MESSAGE_BYTES}*(SELECT count(*) FROM messages WHERE user_id=users.id)
            +${FORGOTTEN_BYTES}*(SELECT count(*) FROM forgotten WHERE user_id=users.id);
          INSERT INTO archive_usage SELECT 1,coalesce(sum(archive_bytes),0) FROM users;`);
        for (const [table, size] of [['events', 'storage_bytes'], ['messages', String(MESSAGE_BYTES)], ['forgotten', String(FORGOTTEN_BYTES)]]) {
          for (const [action, row, sign] of [['INSERT', 'NEW', '+'], ['DELETE', 'OLD', '-']]) {
            const amount = table === 'events' ? `${row}.${size}` : size;
            db.exec(`CREATE TRIGGER ${table}_usage_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN
              UPDATE users SET archive_bytes=archive_bytes${sign}${amount} WHERE id=${row}.user_id;
              UPDATE archive_usage SET used_bytes=used_bytes${sign}${amount} WHERE id=1;
            END;`);
          }
        }
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  db.exec('CREATE INDEX IF NOT EXISTS events_usage_owner ON events(user_id); CREATE INDEX IF NOT EXISTS forgotten_owner ON forgotten(user_id);');
  function assertRoom(userId, requiredBytes = 1) {
    const user = db.prepare('SELECT archive_bytes,archive_limit_bytes FROM users WHERE id=?').get(userId);
    if (!user) throw Object.assign(new Error('Account no longer exists.'), { permanent: true });
    if (user.archive_bytes + requiredBytes > (user.archive_limit_bytes ?? accountLimit)) throw capacityError('archive_quota', requiredBytes);
    if (db.prepare('SELECT used_bytes FROM archive_usage WHERE id=1').get().used_bytes + requiredBytes > serverLimit) throw capacityError('server_capacity', requiredBytes);
    if (minimumFree && available() < minimumFree + requiredBytes) throw capacityError('disk_capacity', requiredBytes);
  }
  function block(id, error) {
    if (!capacityMessages[error.code]) return;
    db.prepare("UPDATE connections SET capacity_reason=?,capacity_required=?,health='error',detail=? WHERE id=? AND revoked=0")
      .run(error.code, error.requiredBytes || 0, capacityMessages[error.code], id);
  }
  function resume(id, userId) {
    const c = db.prepare('SELECT capacity_required FROM connections WHERE id=? AND user_id=? AND revoked=0').get(id, userId);
    if (!c) throw Object.assign(new Error('Connection not found.'), { public: true, status: 404 });
    assertRoom(userId, Math.max(1, c.capacity_required));
    db.prepare('UPDATE connections SET capacity_reason=NULL,capacity_required=0 WHERE id=?').run(id);
  }
  function usage(userId) {
    const user = db.prepare('SELECT archive_bytes,archive_limit_bytes FROM users WHERE id=?').get(userId);
    if (!user) return null;
    const limitBytes = user.archive_limit_bytes ?? accountLimit, usedBytes = user.archive_bytes;
    const blocked = db.prepare('SELECT DISTINCT capacity_reason AS code FROM connections WHERE user_id=? AND revoked=0 AND capacity_reason IS NOT NULL').all(userId);
    return { usedBytes, limitBytes, remainingBytes: Math.max(0, limitBytes - usedBytes),
      nearLimit: usedBytes >= limitBytes * .85, full: usedBytes >= limitBytes,
      captureBlocks: blocked.map(({ code }) => ({ code, message: capacityMessages[code] })) };
  }
  return { assertRoom, block, resume, usage, limits: { accountLimitBytes: accountLimit, serverLimitBytes: serverLimit, minimumFreeBytes: minimumFree } };
}
