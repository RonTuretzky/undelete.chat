import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { createBackup } from '../server/backup.mjs';
import { openQueue } from '../companion/queue.mjs';
import { createOperationsMonitor, readOperationsStatus, readQueueStatus } from '../server/monitor.mjs';

const minute = 60_000, hour = 60 * minute, silent = { info() {} };
const storageTarget = { endpoint: 'https://nyc3.digitaloceanspaces.com', bucket: 'private-fixture' };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'afterword-monitor-')), key = randomBytes(32).toString('hex');
  let time = Date.now(), disk = 8 * 1024 ** 3;
  const store = createStore(join(directory, 'afterword.sqlite'), key, { minimumFreeBytes: 1024 ** 3 });
  const user = await store.createUser('private-owner', 'private-test-password');
  const backup = await createBackup(directory), queues = [], monitors = [];
  const stamp = () => new Date(time).toISOString();
  const backupStatus = async fields => writeFile(join(directory, 'backup-status.json'), JSON.stringify({ state: 'complete', lastAttemptAt: stamp(), lastSnapshotAt: stamp(), lastOffsiteAt: stamp(), offsiteTarget: storageTarget, ...fields }));
  await backupStatus();
  const monitor = options => {
    const m = createOperationsMonitor(store, { directory, offsiteConfigured: true, offsiteTarget: storageTarget, now: () => time, availableBytes: () => disk, startupGraceMs: 0, log: silent, ...options });
    monitors.push(m); return m;
  };
  const source = (platform = 'telegram', connected = true) => {
    const c = store.createConnection(user.id, platform, 'Private source name');
    store.saveHostedConfig(c.id, { privateConfig: 'not-for-monitoring' });
    store.db.prepare("UPDATE connections SET collector='hosted',last_seen=?,health=? WHERE id=?").run(stamp(), connected ? 'connected' : 'waiting', c.id);
    const derived = createHmac('sha256', Buffer.from(key, 'hex')).update('afterword-hosted:' + c.id).digest('hex');
    const queuePath = join(directory, 'collectors', c.id), queue = openQueue(queuePath, derived); queues.push(queue);
    return { ...c, queue, queuePath };
  };
  t.after(async () => { await Promise.all(monitors.map(m => m.close())); for (const queue of queues) { try { queue.close(); } catch {} } try { store.close(); } catch {} await rm(directory, { recursive: true, force: true }); });
  return { directory, key, store, user, backup, source, monitor, backupStatus, stamp, get time() { return time; }, advance(n) { time += n; }, disk(n) { disk = n; },
    heartbeat(c, health = 'connected') { store.db.prepare('UPDATE connections SET last_seen=?,health=? WHERE id=?').run(stamp(), health, c.id); },
    queuedAt(c, uid, when) { const db = new DatabaseSync(join(c.queuePath, 'queue.sqlite')); db.prepare('UPDATE queue SET queued_at=? WHERE uid=?').run(when, uid); db.close(); } };
}
const event = id => ({ eventId: id, kind: 'create', externalId: id, scope: 'account', text: 'Private queued message', occurredAt: new Date().toISOString() });
const codes = result => result.issues.map(i => i.code);

test('quiet connected accounts stay healthy; unfinished linking, pauses and deliberate stops do not create outages', async t => {
  const f = await fixture(t), quiet = f.source(), setup = f.source('signal', false), paused = f.source('whatsapp'), stopped = f.source('telegram');
  f.store.db.prepare("UPDATE connections SET health='error' WHERE id=?").run(setup.id);
  f.store.db.prepare("UPDATE connections SET paused=1,health='error' WHERE id=?").run(paused.id);
  f.store.db.prepare('UPDATE hosted_collectors SET enabled=0 WHERE connection_id=?').run(stopped.id);
  const m = f.monitor(); assert.equal((await m.run()).status, 'healthy');
  f.advance(10 * minute); f.heartbeat(quiet);
  assert.equal((await m.run()).status, 'healthy');
  assert.equal(f.store.messages(f.user.id).length, 0);
  const report = await readOperationsStatus(f.directory, f.time);
  assert.equal(report.collectors.length, 3); assert.equal(report.trackers, undefined);
  assert.equal(JSON.stringify(report).includes('private-owner'), false);
  assert.equal(JSON.stringify(report).includes('Private source name'), false);
  f.store.db.prepare("UPDATE connections SET capacity_reason='archive_quota',health='error' WHERE id=?").run(stopped.id);
  assert.equal((await m.run()).status, 'healthy');
  f.store.db.prepare("UPDATE connections SET capacity_reason='server_capacity' WHERE id=?").run(stopped.id);
  assert.ok(codes(await m.run()).includes('collector_storage_stopped'));
});
test('heartbeat failures and stale monitor results fail the external check without exposing tenant data or failing liveness', async t => {
  const f = await fixture(t), c = f.source(), m = f.monitor();
  const server = createApp(f.store, { monitor: m }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const first = await fetch(url + '/api/monitor'); assert.equal(first.status, 503);
  await m.run(); assert.equal((await fetch(url + '/api/monitor')).status, 200);
  f.advance(2 * minute + 1); const failure = await m.run();
  assert.ok(codes(failure).includes('collector_heartbeat_stale'));
  const response = await fetch(url + '/api/monitor?details=true'); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, service: 'afterword' }); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(url + '/api/health')).status, 200);
  f.heartbeat(c); await m.run(); assert.equal((await fetch(url + '/api/monitor')).status, 200);
  f.advance(minute + 1); assert.equal((await fetch(url + '/api/monitor')).status, 503);
  assert.ok(codes(await readOperationsStatus(f.directory, f.time)).includes('monitor_report_stale'));
});
test('provider failure grace persists across monitor restart and clears only when an established connection recovers', async t => {
  const f = await fixture(t), c = f.source(); let m = f.monitor();
  f.heartbeat(c, 'reconnecting'); assert.equal((await m.run()).status, 'warning'); await m.close();
  f.advance(2 * minute + 1); f.heartbeat(c, 'waiting'); m = f.monitor();
  const failed = await m.run(); assert.equal(failed.status, 'critical'); assert.ok(codes(failed).includes('collector_unavailable'));
  f.heartbeat(c); assert.equal((await m.run()).status, 'healthy');
  const report = JSON.parse(await readFile(join(f.directory, 'operations-status.json'))); assert.deepEqual(report.trackers, {});
});
test('delivery age follows the oldest unacknowledged event, preserves unknown legacy ages, and reports rejected events without reading content', async t => {
  const f = await fixture(t), c = f.source(); let m = f.monitor();
  c.queue.add(event('old')); f.queuedAt(c, 'old', f.time - 6 * minute);
  assert.ok(codes(await m.run()).includes('collector_delivery_stalled'));
  c.queue.ack('old'); c.queue.add(event('fresh')); f.queuedAt(c, 'fresh', f.time);
  assert.equal((await m.run()).status, 'healthy');
  f.queuedAt(c, 'fresh', 0); assert.equal((await m.run()).status, 'healthy'); await m.close();
  f.advance(6 * minute); f.heartbeat(c); m = f.monitor();
  assert.ok(codes(await m.run()).includes('collector_delivery_stalled'));
  c.queue.ack('fresh'); c.queue.add(event('next')); f.queuedAt(c, 'next', 0);
  assert.equal((await m.run()).status, 'healthy', 'an advancing legacy queue must not look stalled');
  c.queue.reject('next', 'private rejection detail'); assert.equal((await m.run()).status, 'warning');
  f.advance(2 * minute + 1); f.heartbeat(c); const rejected = await m.run();
  assert.ok(codes(rejected).includes('collector_rejected_events')); assert.equal(rejected.status, 'critical');
  assert.equal(JSON.stringify(rejected).includes('Private queued message'), false); assert.equal(JSON.stringify(rejected).includes('private rejection detail'), false);
});
test('backup checks verify actual complete files, scheduler freshness and the configured offsite destination', async t => {
  const f = await fixture(t), m = f.monitor(); assert.equal((await m.run()).status, 'healthy');
  const manifestPath = join(f.backup.directory, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, createdAt: new Date(f.time - 27 * hour).toISOString() }));
  assert.ok(codes(await m.run()).includes('local_backup_stale'));
  await writeFile(manifestPath, JSON.stringify(manifest));
  await f.backupStatus({ lastAttemptAt: new Date(f.time - hour).toISOString() });
  assert.ok(codes(await m.run()).includes('backup_scheduler_stale'));
  await f.backupStatus({ offsiteTarget: { ...storageTarget, bucket: 'old-bucket' } });
  assert.ok(codes(await m.run()).includes('offsite_backup_stale'));
  await f.backupStatus({ state: 'failed' }); assert.equal((await m.run()).status, 'warning');
  f.advance(21 * minute); await f.backupStatus({ state: 'failed' }); assert.equal((await m.run()).status, 'critical');
  await f.backupStatus(); assert.equal((await m.run()).status, 'healthy');
  await rm(join(f.backup.directory, 'afterword.sqlite'));
  const freshMonitor = f.monitor({ startupGraceMs: 15 * minute });
  assert.ok(codes(await freshMonitor.run()).includes('local_backup_invalid'));
  assert.equal(freshMonitor.publicState().ok, false, 'startup grace cannot hide a broken completed snapshot');
});
test('disk reserve, global capacity, disabled workers and inaccessible queues produce actionable checks', async t => {
  const f = await fixture(t), c = f.source(), m = f.monitor();
  f.disk(100); assert.ok(codes(await m.run()).includes('disk_reserve')); f.disk(8 * 1024 ** 3);
  f.store.db.prepare('UPDATE archive_usage SET used_bytes=? WHERE id=1').run(f.store.capacity.limits.serverLimitBytes);
  assert.ok(codes(await m.run()).includes('archive_full')); f.store.db.exec('UPDATE archive_usage SET used_bytes=0 WHERE id=1');
  assert.ok(codes(await f.monitor({ hostedEnabled: false }).run()).includes('hosted_collectors_disabled'));
  const inaccessible = f.monitor({ queueStatus() { throw new Error('Private database path or payload must not be leaked'); } });
  assert.equal((await inaccessible.run()).status, 'warning');
  f.advance(2 * minute + 1); f.heartbeat(c); const result = await inaccessible.run();
  assert.equal(result.status, 'critical'); assert.ok(codes(result).includes('collector_queue_unreadable'));
  assert.equal(JSON.stringify(result).includes('Private database'), false);
  const localOnly = f.monitor({ offsiteConfigured: false });
  assert.equal((await localOnly.run()).status, 'warning'); assert.equal(localOnly.publicState().ok, true);
  assert.ok(codes(localOnly.snapshot()).includes('offsite_unconfigured'));
});
test('connection and queue metadata migrations preserve ciphertext and establish only evidenced connections', async t => {
  const f = await fixture(t), established = f.source(), waiting = f.source('signal', false);
  f.store.ingest(f.store.connection(established.id, f.user.id), event('archived'));
  const payload = f.store.db.prepare('SELECT payload FROM events').get().payload;
  established.queue.add(event('legacy-queued')); established.queue.close(); waiting.queue.close();
  f.store.db.exec('DROP TRIGGER connection_first_connected; ALTER TABLE connections DROP COLUMN connected_at;');
  f.store.close();
  const db = new DatabaseSync(join(established.queuePath, 'queue.sqlite')); const encrypted = db.prepare('SELECT payload FROM queue').get().payload;
  db.exec('ALTER TABLE queue DROP COLUMN queued_at'); db.close();
  assert.equal(readQueueStatus(join(established.queuePath, 'queue.sqlite')).oldestQueuedAt, null);
  const restored = createStore(join(f.directory, 'afterword.sqlite'), f.key);
  assert.ok(restored.connection(established.id, f.user.id).connected_at); assert.equal(restored.connection(waiting.id, f.user.id).connected_at, null);
  assert.equal(restored.db.prepare('SELECT payload FROM events').get().payload, payload); restored.close();
  const derived = createHmac('sha256', Buffer.from(f.key, 'hex')).update('afterword-hosted:' + established.id).digest('hex');
  const queue = openQueue(established.queuePath, derived); assert.equal(queue.pending()[0].text, 'Private queued message'); queue.close();
  const check = new DatabaseSync(join(established.queuePath, 'queue.sqlite'), { readOnly: true });
  assert.equal(check.prepare('SELECT payload FROM queue').get().payload, encrypted); assert.equal(check.prepare('SELECT queued_at FROM queue').get().queued_at, 0); check.close();
});

test('one customer\'s unavailable source is a warning; every established source failing is critical', async t => {
  const f = await fixture(t), a = f.source(), b = f.source(); const m = f.monitor();
  f.heartbeat(a); f.heartbeat(b); assert.equal((await m.run()).status, 'healthy');
  f.heartbeat(a, 'error'); f.advance(2 * minute + 1); f.heartbeat(a, 'error'); f.heartbeat(b);
  const partial = await m.run();
  assert.equal(partial.status, 'warning'); assert.ok(codes(partial).includes('collector_unavailable')); assert.ok(!codes(partial).includes('collectors_all_unavailable'));
  f.heartbeat(b, 'reconnecting'); assert.equal((await m.run()).status, 'warning', 'the second failure starts its own grace period');
  f.advance(2 * minute + 1); f.heartbeat(a, 'error'); f.heartbeat(b, 'reconnecting');
  const total = await m.run();
  assert.equal(total.status, 'critical'); assert.ok(codes(total).includes('collectors_all_unavailable'));
  f.heartbeat(b); assert.equal((await m.run()).status, 'warning');
});
