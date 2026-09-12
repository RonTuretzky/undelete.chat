import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { createCollectorManager } from '../server/hosted/manager.mjs';
import { openQueue } from '../companion/queue.mjs';
import { encryptedWhatsAppAuth } from '../companion/adapters/whatsapp-auth.mjs';
import { signalVault } from '../server/hosted/signal-vault.mjs';
import { startSignal, linkWindowMs, maxLinkAttempts } from '../companion/adapters/signal.mjs';
const until = async (fn, limit = 10_000) => { const deadline = Date.now() + limit; while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 30)); } throw new Error('Condition did not become true'); };
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-hosted-test-'));
  const key = randomBytes(32).toString('hex');
  const { storeOptions, ...managerOptions } = options;
  const store = createStore(join(directory, 'archive.sqlite'), key, storeOptions);
  const alice = await store.createUser('alice', 'long-test-password-alice'), bob = await store.createUser('bob', 'long-test-password-bob');
  const children = [], environments = [];
  const settings = { directory, key, runtimeDirectory: join(directory, 'runtime'), maxCollectors: 4, telegramApiId: 1234, telegramApiHash: '1'.repeat(32),
    spawn: fixtureSpawn, ...managerOptions };
  function fixtureSpawn(_file, args, config) {
    assert.equal(config.env.ARCHIVE_KEY, undefined);
    environments.push(config.env);
    const child = fork(new URL('./fixtures/hosted-worker.mjs', import.meta.url), args, config);
    children.push(child); return child;
  }
  let manager = createCollectorManager(store, settings);
  t.after(async () => { await manager.close(); store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, key, store, alice, bob, children, environments, fixtureSpawn, get manager() { return manager; }, async restart() { await manager.close(); manager = createCollectorManager(store, settings); await manager.restore(); } };
}
test('hosted QR and login endpoints require source ownership and reject stale replies and cross-site requests', async t => {
  const f = await fixture(t), { store, alice, bob } = f;
  const c = store.createConnection(alice.id, 'whatsapp', 'Personal');
  const server = createApp(store, { collectors: f.manager, origins: ['http://localhost'] }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body, user = alice, origin) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: `afterword=${store.session(user.id)}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const path = `/connections/${c.id}/hosted`;
  assert.equal((await request(path, 'GET', undefined, null)).status, 401);
  assert.equal((await request(path, 'GET', undefined, bob)).status, 404);
  assert.equal((await request(path + '/start', 'POST', { consent: true }, bob)).status, 404);
  assert.equal((await request(path + '/start', 'POST', { consent: true }, alice, 'https://other.example')).status, 403);
  assert.equal((await request(path + '/start', 'POST', {})).status, 400);
  assert.equal((await request(path + '/start', 'POST', { consent: true })).status, 200);
  await until(() => f.manager.status(c.id).qr);
  assert.match(f.manager.status(c.id).qr.image, /^data:image\/png;base64,/);
  assert.equal(store.connectionByToken(c.token), undefined);
  assert.equal(store.createPairing(c.id, alice.id), null);
  assert.equal((await request(path + '/reply', 'POST', { promptId: randomUUID(), value: 'private password' })).status, 409);
  const promptId = randomUUID(); f.children[0].send({ type: 'fixture-prompt', id: promptId });
  await until(() => f.manager.status(c.id).prompt);
  assert.equal((await request(path + '/reply', 'POST', { promptId, value: 'private password' }, bob)).status, 404);
  assert.equal((await request(path + '/reply', 'POST', { promptId, value: 'private password' })).status, 200);
  await until(() => store.messages(alice.id).length === 1);
  assert.equal(f.manager.status(c.id).qr, null); assert.equal(f.manager.status(c.id).prompt, null);
  assert.equal((await request(path + '/reply', 'POST', { promptId, value: 'private password' })).status, 409);
  assert.equal(store.messages(bob.id).length, 0);
  const m = store.messages(alice.id)[0]; assert.equal(m.status, 'deleted'); assert.equal(m.versions.length, 3);
  await request(`/connections/${c.id}`, 'DELETE', {});
  assert.equal(f.manager.status(c.id).running, false);
  assert.equal(existsSync(join(f.directory, 'collectors', c.id)), false);
  assert.equal(store.messages(alice.id).length, 1, 'disconnect preserves the archive');
});
test('real worker processes resume encrypted sessions after supervisor restart and recover from process failure', async t => {
  const f = await fixture(t), c = f.store.createConnection(f.alice.id, 'telegram', 'Cloud');
  await f.manager.start(c.id, f.alice.id, { consent: true });
  await until(() => f.manager.status(c.id).qr);
  const id = randomUUID(); f.children[0].send({ type: 'fixture-prompt', id });
  await until(() => f.manager.status(c.id).prompt);
  f.manager.reply(c.id, f.alice.id, id, 'secret-password');
  await until(() => f.store.messages(f.alice.id).length === 1);
  const connectedAt = f.store.connection(c.id, f.alice.id).connected_at; assert.ok(connectedAt);
  await f.restart();
  await until(() => f.manager.status(c.id).health === 'connected');
  assert.equal(f.manager.status(c.id).qr, null);
  assert.equal(f.store.connection(c.id, f.alice.id).connected_at, connectedAt);
  f.children.at(-1).kill('SIGKILL');
  await until(() => f.children.length === 3 && f.manager.status(c.id).health === 'connected');
  assert.equal(f.store.messages(f.alice.id)[0].versions.length, 3, 'retried events are idempotent');
  assert.equal(existsSync(join(f.directory, 'collectors', c.id, 'queue.key')), false);
  const raw = readFileSync(join(f.directory, 'collectors', c.id, 'queue.sqlite'));
  assert.equal(raw.includes(Buffer.from('Original private text')), false);
  assert.equal(raw.includes(Buffer.from('secret-password')), false);
});
test('a full archive stops its worker, preserves queued events across restart, and resumes after space is available', async t => {
  const f = await fixture(t, { storeOptions: { accountLimitBytes: 1 } });
  const c = f.store.createConnection(f.alice.id, 'telegram', 'Limited archive');
  await f.manager.start(c.id, f.alice.id, { consent: true });
  await until(() => f.manager.status(c.id).qr);
  const id = randomUUID(); f.children[0].send({ type: 'fixture-prompt', id });
  await until(() => f.manager.status(c.id).prompt);
  f.manager.reply(c.id, f.alice.id, id, 'test approval');
  await until(() => !f.manager.status(c.id).running && f.manager.status(c.id).capacityReason === 'archive_quota');
  assert.equal(f.manager.status(c.id).enabled, false);
  assert.equal(f.store.messages(f.alice.id).length, 0);
  assert.equal(f.store.connection(c.id, f.alice.id).queued, 3);
  await assert.rejects(f.manager.start(c.id, f.alice.id), { code: 'archive_quota' });
  await f.restart();
  assert.equal(f.manager.status(c.id).running, false); assert.equal(f.children.length, 1);
  f.store.db.prepare('UPDATE users SET archive_limit_bytes=100000 WHERE id=?').run(f.alice.id);
  await assert.rejects(f.manager.start(c.id, f.alice.id, { relink: true }), /unsent events/);
  await f.manager.start(c.id, f.alice.id);
  await until(() => f.store.messages(f.alice.id)[0]?.versions.length === 3);
  await until(() => f.store.connection(c.id, f.alice.id).queued === 0);
  assert.equal(f.manager.status(c.id).health, 'connected');
  assert.equal(f.manager.status(c.id).capacityReason, null); assert.equal(f.manager.status(c.id).qr, null);
});
test('relinking preserves an event queued during worker shutdown', async t => {
  const f = await fixture(t), c = f.store.createConnection(f.alice.id, 'telegram', 'Cloud');
  await f.manager.start(c.id, f.alice.id, { consent: true });
  await until(() => f.manager.status(c.id).qr);
  f.children[0].send({ type: 'fixture-queue-on-stop', event: { eventId: 'during-stop', kind: 'create', externalId: 'stop-race', scope: 'account', text: 'Keep this unsent copy', occurredAt: new Date().toISOString() } });
  await assert.rejects(f.manager.start(c.id, f.alice.id, { relink: true }), /unsent events/);
  assert.equal(existsSync(join(f.directory, 'collectors', c.id, 'queue.sqlite')), true);
  assert.equal(f.manager.status(c.id).enabled, false);
  await f.manager.start(c.id, f.alice.id);
  await until(() => f.store.messages(f.alice.id).some(m => m.text === 'Keep this unsent copy'));
});
test('concurrent starts respect global capacity; separate accounts cannot start or reply to another source', async t => {
  const f = await fixture(t, { maxCollectors: 1 });
  const a = f.store.createConnection(f.alice.id, 'signal', 'Alice'), b = f.store.createConnection(f.bob.id, 'signal', 'Bob');
  await assert.rejects(f.manager.start(a.id, f.bob.id, { consent: true }), /not found/);
  const results = await Promise.allSettled([f.manager.start(a.id, f.alice.id, { consent: true }), f.manager.start(b.id, f.bob.id, { consent: true })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
test('Signal native library caches are separate from private runtime files and cleaned after failure or stop', async t => {
  const cache = mkdtempSync(join(tmpdir(), 'afterword-native-cache-'));
  const f = await fixture(t, { signalNativeDirectory: cache });
  t.after(() => rmSync(cache, { recursive: true, force: true }));
  const a = f.store.createConnection(f.alice.id, 'signal', 'Alice');
  const b = f.store.createConnection(f.bob.id, 'signal', 'Bob');
  await f.manager.start(a.id, f.alice.id, { consent: true });
  await f.manager.start(b.id, f.bob.id, { consent: true });
  await until(() => f.manager.status(a.id).qr && f.manager.status(b.id).qr);
  assert.equal(f.environments[0].SIGNAL_NATIVE_DIR, join(cache, a.id));
  assert.notEqual(f.environments[0].SIGNAL_NATIVE_DIR, f.environments[0].TMPDIR);
  assert.notEqual(f.environments[0].SIGNAL_NATIVE_DIR, f.environments[1].SIGNAL_NATIVE_DIR);
  writeFileSync(join(cache, a.id, 'library-copy.so'), 'library bytes');
  writeFileSync(join(cache, b.id, 'library-copy.so'), 'other library bytes');
  f.children[0].kill('SIGKILL');
  await until(() => f.children.length === 3 && f.manager.status(a.id).qr);
  assert.equal(existsSync(join(cache, a.id, 'library-copy.so')), false);
  assert.equal(existsSync(join(cache, b.id, 'library-copy.so')), true);
  await f.manager.suspend(a.id);
  assert.equal(existsSync(join(cache, a.id)), false);
  const abandoned = join(cache, randomUUID()); mkdirSync(abandoned);
  await f.restart();
  assert.equal(existsSync(abandoned), false);
  assert.equal(existsSync(join(cache, b.id, 'library-copy.so')), false);
});
test('WhatsApp auth keys remain encrypted and restore binary values after reopening the vault', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-wa-vault-')), key = randomBytes(32).toString('hex');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let queue = openQueue(directory, key), auth = encryptedWhatsAppAuth(queue);
  auth.state.creds.me = { id: 'private-account-id', name: 'Private display name' }; auth.saveCreds();
  await auth.state.keys.set({ session: { device: Buffer.from('private-session-key') } }); queue.close();
  queue = openQueue(directory, key); auth = encryptedWhatsAppAuth(queue);
  assert.equal(auth.state.creds.me.id, 'private-account-id');
  assert.deepEqual((await auth.state.keys.get('session', ['device'])).device, Buffer.from('private-session-key'));
  await auth.state.keys.set({ session: { device: null } }); assert.equal((await auth.state.keys.get('session', ['device'])).device, undefined);
  queue.close();
  const raw = readFileSync(join(directory, 'queue.sqlite')); assert.equal(raw.includes(Buffer.from('private-account-id')), false); assert.equal(raw.includes(Buffer.from('private-session-key')), false);
});
test('Signal session snapshots restore from encrypted storage and reject escaping paths', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-signal-vault-')), key = randomBytes(32).toString('hex');
  const queue = openQueue(join(directory, 'persistent'), key); t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }); });
  const runtime = join(directory, 'runtime'); const vault = await signalVault(runtime, queue);
  mkdirSync(join(runtime, 'data')); writeFileSync(join(runtime, 'data', 'account'), 'private-signal-key');
  await vault.checkpoint(); rmSync(runtime, { recursive: true }); await signalVault(runtime, queue);
  assert.equal(readFileSync(join(runtime, 'data', 'account'), 'utf8'), 'private-signal-key');
  queue.set('signal-session-files', { '../escape': Buffer.from('bad').toString('base64') });
  await assert.rejects(signalVault(runtime, queue), /Invalid saved Signal path/);
});
test('Signal session growth stops before replacing the last encrypted checkpoint', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-signal-bound-'));
  const queue = openQueue(join(directory, 'persistent'));
  t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }); });
  const runtime = join(directory, 'runtime'), vault = await signalVault(runtime, queue);
  writeFileSync(join(runtime, 'account'), 'saved session'); await vault.checkpoint();
  const before = queue.get('signal-session-files'), usage = queue.usage();
  writeFileSync(join(runtime, 'too-large'), ''); truncateSync(join(runtime, 'too-large'), 17 * 1024 * 1024);
  await assert.rejects(vault.checkpoint(), { code: 'collector_capacity' });
  assert.deepEqual(queue.get('signal-session-files'), before); assert.deepEqual(queue.usage(), usage);
});
test('Signal shutdown waits for the native process to finish saving session files', { skip: process.platform === 'win32' }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-signal-stop-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const saved = join(directory, 'saved');
  writeFileSync(join(directory, 'signal-cli'), `#!/usr/bin/env node
const fs = require('node:fs');
const lines = require('node:readline').createInterface({ input: process.stdin });
lines.on('line', line => { const r = JSON.parse(line); console.log(JSON.stringify({ jsonrpc: '2.0', id: r.id, result: ['linked-account'] })); });
process.on('SIGTERM', () => { setTimeout(() => { fs.writeFileSync(${JSON.stringify(saved)}, 'session saved'); process.exit(0); }, 150); });
`, { mode: 0o700 });
  const oldPath = process.env.PATH; let starting;
  try {
    process.env.PATH = directory + ':' + oldPath;
    starting = startSignal({ directory, health() {}, checkpoint: async () => {} });
  } finally { process.env.PATH = oldPath; }
  const stop = await starting;
  t.after(stop);
  await stop();
  assert.equal(readFileSync(saved, 'utf8'), 'session saved');
});
test('a worker that cannot be started is retried with backoff instead of crashing the supervisor', async t => {
  let attempts = 0, f;
  f = await fixture(t, { spawn(file, args, config) {
    if (++attempts === 1) throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    return f.fixtureSpawn(file, args, config);
  } });
  const { store, alice } = f;
  const c = store.createConnection(alice.id, 'whatsapp', 'Personal');
  const rejections = []; const onRejection = error => rejections.push(error); process.on('unhandledRejection', onRejection);
  t.after(() => process.off('unhandledRejection', onRejection));
  await f.manager.start(c.id, alice.id, { consent: true });
  const first = f.manager.status(c.id);
  assert.equal(first.running, false); assert.equal(first.health, 'reconnecting'); assert.match(first.detail, /Retrying automatically/);
  await until(() => f.manager.status(c.id).running, 15_000);
  await until(() => f.manager.status(c.id).qr, 15_000);
  assert.equal(attempts, 2); assert.equal(rejections.length, 0);
  await f.manager.suspend(c.id);
  assert.equal(f.manager.status(c.id).running, false);
});
test('Signal linking issues a fresh code when the provisioning window closes and gives up after the attempt limit', { skip: process.platform === 'win32' }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-signal-link-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'signal-cli'), `#!/usr/bin/env node
const failures = Number(process.env.FAKE_LINK_FAILURES); let links = 0, finishes = 0;
const lines = require('node:readline').createInterface({ input: process.stdin });
lines.on('line', line => {
  const r = JSON.parse(line), reply = result => console.log(JSON.stringify({ jsonrpc: '2.0', id: r.id, result }));
  if (r.method === 'listAccounts') reply([]);
  else if (r.method === 'startLink') reply({ deviceLinkUri: 'sgnl://linkdevice?uuid=code-' + (++links) });
  else if (r.method === 'finishLink') { if (++finishes <= failures) console.log(JSON.stringify({ jsonrpc: '2.0', id: r.id, error: { code: -1, message: 'Link request timed out' } })); else reply({ number: '+15550100' }); }
});
process.on('SIGTERM', () => process.exit(0));
`, { mode: 0o700 });
  const run = async failures => {
    const codes = [], states = [];
    const oldPath = process.env.PATH, oldFailures = process.env.FAKE_LINK_FAILURES; let starting;
    try {
      process.env.PATH = directory + ':' + oldPath; process.env.FAKE_LINK_FAILURES = String(failures);
      starting = startSignal({ directory: join(directory, 'run-' + failures), hosted: true, showQR: (value, expiresAt) => codes.push({ value, expiresAt }), health: (state, detail) => states.push(state + ':' + detail), checkpoint: async () => {} });
    } finally { process.env.PATH = oldPath; if (oldFailures === undefined) delete process.env.FAKE_LINK_FAILURES; else process.env.FAKE_LINK_FAILURES = oldFailures; }
    return { codes, states, result: starting };
  };
  const recovered = await run(2);
  const stop = await recovered.result; t.after(stop);
  assert.deepEqual(recovered.codes.map(c => c.value), ['sgnl://linkdevice?uuid=code-1', 'sgnl://linkdevice?uuid=code-2', 'sgnl://linkdevice?uuid=code-3']);
  assert.ok(recovered.codes.every(c => c.expiresAt - Date.now() <= linkWindowMs && c.expiresAt - Date.now() > linkWindowMs - 10_000));
  assert.equal(recovered.states.filter(s => s.startsWith('waiting:The previous code expired')).length, 2);
  assert.equal(recovered.states.at(-1), 'connected:Signal linked device connected');
  await stop();
  const exhausted = await run(maxLinkAttempts);
  await assert.rejects(exhausted.result, /Signal RPC -1/);
  assert.equal(exhausted.codes.length, maxLinkAttempts);
});

test('a stalled restart of a previously linked source is retried, while an unlinked source waits for the owner', async t => {
  const f = await fixture(t), { store, alice } = f;
  const linked = store.createConnection(alice.id, 'telegram', 'Linked before'), fresh = store.createConnection(alice.id, 'whatsapp', 'Never linked');
  await f.manager.start(linked.id, alice.id, { consent: true }); await f.manager.start(fresh.id, alice.id, { consent: true });
  await until(() => f.children.length === 2 && f.manager.status(linked.id).running && f.manager.status(fresh.id).running);
  store.db.prepare('UPDATE connections SET connected_at=? WHERE id=?').run(new Date().toISOString(), linked.id);
  f.children[0].send({ type: 'fixture-exit', code: 2 }); f.children[1].send({ type: 'fixture-exit', code: 2 });
  await until(() => !f.manager.status(fresh.id).running && f.manager.status(fresh.id).health === 'error');
  assert.match(f.manager.status(fresh.id).detail, /Choose Try again/);
  await until(() => f.manager.status(linked.id).health === 'reconnecting');
  assert.match(f.manager.status(linked.id).detail, /Retrying automatically/);
  await until(() => f.children.length === 3 && f.manager.status(linked.id).running, 15_000);
  assert.equal(f.children.length, 3, 'only the previously linked source was relaunched');
});
