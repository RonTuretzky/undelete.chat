import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { openQueue, deliverBatch } from '../companion/queue.mjs';
import { eventBytes, MESSAGE_BYTES, FORGOTTEN_BYTES } from '../server/archive-capacity.mjs';

const event = (n, extra = {}) => ({ eventId: `event-${n}`, externalId: String(n), scope: 'personal', kind: 'create',
  text: 'Private captured text', occurredAt: new Date(Date.now() - 10000).toISOString(), ...extra });
async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'afterword-capacity-')), key = randomBytes(32).toString('hex');
  const path = join(dir, 'archive.sqlite'), store = createStore(path, key, options);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const user = await store.createUser('alice', 'a-long-private-password');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Personal').token);
  return { dir, key, path, store, user, source };
}
const actualUsage = (store, userId) => {
  const events = store.db.prepare('SELECT payload,event_uid FROM events WHERE user_id=?').all(userId);
  return events.reduce((n, e) => n + eventBytes(e.payload, e.event_uid), 0)
    + MESSAGE_BYTES * store.db.prepare('SELECT count(*) n FROM messages WHERE user_id=?').get(userId).n
    + FORGOTTEN_BYTES * store.db.prepare('SELECT count(*) n FROM forgotten WHERE user_id=?').get(userId).n;
};

test('account allowances include all revisions, ignore duplicates, release deleted history and isolate customers', async t => {
  const { store, user, source } = await fixture(t, { accountLimitBytes: 5000 });
  const original = event(1), { id } = store.ingest(source, original);
  const before = store.capacity.usage(user.id).usedBytes;
  assert.equal(before, actualUsage(store, user.id));
  assert.equal(store.ingest(source, original).duplicate, true);
  assert.equal(store.capacity.usage(user.id).usedBytes, before);
  assert.throws(() => store.ingest(source, event(2, { text: 'x'.repeat(4000) })), { code: 'archive_quota', retryable: true });
  assert.equal(store.messages(user.id).length, 1);
  assert.equal(store.capacity.usage(user.id).usedBytes, before);
  assert.equal(store.capacity.usage(user.id).captureBlocks[0].code, 'archive_quota');
  const bob = await store.createUser('bob', 'another-long-password');
  const other = store.connectionByToken(store.createConnection(bob.id, 'signal', 'Other').token);
  store.ingest(other, event(3));
  store.ingest(source, event(4, { externalId: '1', kind: 'edit', text: 'Revision' }));
  assert.equal(store.capacity.usage(user.id).usedBytes, actualUsage(store, user.id));
  const bobBytes = store.capacity.usage(bob.id).usedBytes;
  store.forgetMessage(id, user.id);
  assert.equal(store.capacity.usage(user.id).usedBytes, FORGOTTEN_BYTES);
  assert.equal(store.capacity.usage(bob.id).usedBytes, bobBytes);
  assert.equal(store.ingest(source, original).reason, 'removed');
  store.db.prepare('DELETE FROM users WHERE id=?').run(user.id);
  assert.equal(store.db.prepare('SELECT used_bytes FROM archive_usage').get().used_bytes, bobBytes);
});

test('retention, transaction rollback, paused and ephemeral events cannot drift storage accounting', async t => {
  const { store, user, source } = await fixture(t);
  store.ingest({ ...source, paused: 1 }, event(1)); store.ingest(source, event(2, { ephemeral: true }));
  assert.equal(store.capacity.usage(user.id).usedBytes, 0);
  store.db.exec("CREATE TRIGGER simulate_write_failure BEFORE INSERT ON events WHEN NEW.event_uid='event-3' BEGIN SELECT RAISE(ABORT,'private database error'); END;");
  assert.throws(() => store.ingest(source, event(3)));
  assert.equal(store.capacity.usage(user.id).usedBytes, 0); assert.equal(store.messages(user.id).length, 0);
  const { id } = store.ingest(source, event(4));
  store.db.prepare('UPDATE messages SET first_seen=? WHERE id=?').run(new Date(Date.now() - 91 * 86400_000).toISOString(), id);
  store.purge();
  assert.equal(store.capacity.usage(user.id).usedBytes, FORGOTTEN_BYTES);
  assert.equal(store.db.prepare('SELECT used_bytes FROM archive_usage').get().used_bytes, FORGOTTEN_BYTES);
});

test('global budget and disk reserve reject new writes without rejecting stored duplicate acknowledgements', async t => {
  let available = 100000;
  const { store, user, source, path, key } = await fixture(t, { accountLimitBytes: 100000, serverLimitBytes: 5000, minimumFreeBytes: 10000, freeBytes: () => available });
  const input = event(1); store.ingest(source, input);
  const second = createStore(path, key, { accountLimitBytes: 100000, serverLimitBytes: 5000 }); t.after(() => second.close());
  const bob = await second.createUser('bob', 'another-long-password');
  const other = second.connectionByToken(second.createConnection(bob.id, 'signal', 'Other').token);
  assert.throws(() => second.ingest(other, event(2, { text: 'x'.repeat(2000) })), { code: 'server_capacity' });
  available = 10000;
  assert.equal(store.ingest(source, input).duplicate, true);
  assert.throws(() => store.ingest(source, event(3, { externalId: '1', kind: 'edit', text: 'changed text' })), { code: 'disk_capacity' });
  assert.equal(store.capacity.usage(user.id).usedBytes, actualUsage(store, user.id));
});

test('existing ciphertext migrates into byte accounting and reopening is idempotent', async t => {
  const { store, user, source, path, key } = await fixture(t);
  store.ingest(source, event(1)); store.ingest(source, event(2, { externalId: '1', kind: 'edit' }));
  const forgotten = store.ingest(source, event(3)); store.forgetMessage(forgotten.id, user.id);
  const ciphertext = store.db.prepare('SELECT id,payload FROM events ORDER BY id').all();
  const expected = actualUsage(store, user.id);
  // Remove only the new schema to reproduce the prior deployed database format.
  for (const table of ['events', 'messages', 'forgotten']) for (const action of ['insert', 'delete']) store.db.exec(`DROP TRIGGER ${table}_usage_${action}`);
  store.db.exec(`DROP INDEX events_usage_owner; DROP TABLE archive_usage;
    ALTER TABLE users DROP COLUMN archive_bytes; ALTER TABLE users DROP COLUMN archive_limit_bytes;
    ALTER TABLE events DROP COLUMN user_id; ALTER TABLE events DROP COLUMN storage_bytes;
    ALTER TABLE connections DROP COLUMN capacity_reason; ALTER TABLE connections DROP COLUMN capacity_required;`);
  const migrated = createStore(path, key);
  assert.equal(migrated.capacity.usage(user.id).usedBytes, expected);
  assert.deepEqual(migrated.db.prepare('SELECT id,payload FROM events ORDER BY id').all(), ciphertext);
  assert.equal(migrated.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  migrated.close();
  const reopened = createStore(path, key); t.after(() => reopened.close());
  assert.equal(reopened.capacity.usage(user.id).usedBytes, expected);
});

test('HTTP usage is private and temporary ingest errors stay retryable without exposing internal details', async t => {
  const { store, user, source } = await fixture(t, { accountLimitBytes: 1 });
  const server = createApp(store).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await fetch(base + '/usage')).status, 401);
  const usage = await (await fetch(base + '/usage', { headers: { Cookie: `afterword=${store.session(user.id)}` } })).json();
  assert.equal(usage.usage.limitBytes, 1); assert.equal(usage.usage.usedBytes, 0);
  const post = events => fetch(base + '/ingest', { method: 'POST', headers: { Authorization: `Bearer ${store.createConnection(user.id, 'telegram', 'HTTP').token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }).then(r => r.json());
  const full = await post([event(1), { invalid: true }]);
  assert.equal(full.results[0].code, 'archive_quota'); assert.equal(full.results[0].retryable, true);
  assert.equal(full.results[1].code, 'invalid_event'); assert.equal(full.results[1].retryable, false);
  store.db.prepare('UPDATE users SET archive_limit_bytes=100000 WHERE id=?').run(user.id);
  store.db.exec("CREATE TRIGGER fail_http BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'private internal details'); END;");
  const failed = await post([event(2)]);
  assert.equal(failed.results[0].retryable, true); assert.equal(failed.results[0].code, 'archive_unavailable');
  assert.equal(JSON.stringify(failed).includes('private internal details'), false);
});

test('collector queues bound events and metadata, preserve old values, reclaim acknowledgements and cap request bodies', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'afterword-bounded-queue-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  let queue = openQueue(dir, undefined, { eventLimitBytes: 4000, metadataLimitBytes: 2000 });
  queue.add(event(1)); queue.set('session', { key: 'private' });
  const before = queue.usage();
  queue.add(event(1)); assert.deepEqual(queue.usage(), before);
  assert.throws(() => queue.add(event(2, { text: 'x'.repeat(3000) })), { code: 'collector_capacity' });
  assert.throws(() => queue.set('session', { key: 'x'.repeat(2000) }), { code: 'collector_capacity' });
  assert.equal(queue.get('session').key, 'private'); assert.deepEqual(queue.usage(), before);
  queue.reject('event-1', 'Invalid event'); assert.equal(queue.usage().queue, before.queue);
  queue.ack('event-1'); assert.equal(queue.usage().queue, 0); queue.close();
  queue = openQueue(dir); t.after(() => queue.close());
  assert.equal(queue.usage().queue, 0); assert.equal(queue.usage().metadata, before.metadata);
  for (let n = 0; n < 30; n++) queue.add(event(n, { text: 'é'.repeat(100000) }));
  const pending = queue.pending();
  assert.ok(pending.length > 1 && pending.length < 30);
  assert.ok(Buffer.byteLength(JSON.stringify({ events: pending })) < 2 * 1024 * 1024);
  const lowDisk = openQueue(join(dir, 'low-disk'), undefined, { minimumFreeBytes: 1000, freeBytes: () => 1000 });
  assert.throws(() => lowDisk.add(event(99)), { code: 'collector_capacity' });
  assert.throws(() => lowDisk.set('session', 'cannot fit'), { code: 'collector_capacity' });
  assert.deepEqual(lowDisk.usage(), { queue: 0, metadata: 0 }); lowDisk.close();
});

test('delivery retains retryable events, quarantines invalid events, and still acknowledges successful peers', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'afterword-retry-')); const queue = openQueue(dir);
  t.after(() => { queue.close(); rmSync(dir, { recursive: true, force: true }); });
  for (let n = 1; n <= 3; n++) queue.add(event(n));
  await assert.rejects(deliverBatch({ queue, server: 'https://example.invalid', token: 'test', fetcher: async () => ({ ok: true, json: async () => ({ results: [
    { eventId: 'event-1', error: 'Archive full', retryable: true, code: 'archive_quota' },
    { eventId: 'event-2', error: 'Invalid', retryable: false }, { eventId: 'event-3', id: 'stored' },
  ] }) }) }), { code: 'archive_quota', capacity: true });
  assert.equal(queue.count(), 1); assert.equal(queue.rejected(), 1);
  assert.equal(queue.pending()[0].eventId, 'event-1');
  await deliverBatch({ queue, server: 'https://example.invalid', token: 'test', fetcher: async () => ({ ok: true, json: async () => ({ results: [{ eventId: 'event-1', id: 'stored-after-recovery' }] }) }) });
  assert.equal(queue.count(), 0); assert.equal(queue.rejected(), 1);
});
