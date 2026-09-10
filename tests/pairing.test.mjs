import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { serverOrigin, redeemCode, savePairedProfile } from '../companion/pairing.mjs';

async function fixture(t) {
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  t.after(() => store.close());
  const alice = await store.createUser('alice', 'some-password-for-alice');
  const bob = await store.createUser('bob', 'some-password-for-bob');
  const connection = store.createConnection(alice.id, 'telegram', 'Personal Telegram');
  return { store, alice, bob, connection };
}
test('pairing requires ownership and stores only a digest of a ten-minute code', async t => {
  const { store, alice, bob, connection } = await fixture(t);
  assert.equal(store.createPairing(connection.id, bob.id), null);
  const pairing = store.createPairing(connection.id, alice.id);
  assert.match(pairing.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.ok(Date.parse(pairing.expiresAt) - Date.now() <= 600_000);
  const row = store.db.prepare('SELECT * FROM pairing_codes').get();
  assert.equal(JSON.stringify(row).includes(pairing.code.replace('-', '')), false);
  assert.ok(store.connectionByToken(connection.token), 'generating a code must not interrupt an active collector');
});
test('redeeming is single-use and rotates only the chosen connection key', async t => {
  const { store, alice, bob, connection } = await fixture(t);
  const other = store.createConnection(bob.id, 'signal', 'Bob Signal');
  const pairing = store.createPairing(connection.id, alice.id);
  const paired = store.redeemPairing(pairing.code.toLowerCase());
  assert.equal(paired.connectionId, connection.id);
  assert.equal(paired.profile, `telegram-${connection.id.slice(0, 8)}`);
  assert.equal(store.redeemPairing(pairing.code), null);
  assert.equal(store.connectionByToken(connection.token), undefined);
  assert.equal(store.connectionByToken(paired.token).user_id, alice.id);
  assert.equal(store.connectionByToken(other.token).user_id, bob.id);
  assert.equal(store.connections(alice.id)[0].health, 'waiting', 'archive pairing alone must not report a platform as connected');
});
test('expired, superseded, and revoked codes cannot be redeemed', async t => {
  const { store, alice, connection } = await fixture(t);
  const old = store.createPairing(connection.id, alice.id);
  const current = store.createPairing(connection.id, alice.id);
  assert.equal(store.redeemPairing(old.code), null);
  store.db.prepare('UPDATE pairing_codes SET expires_at=?').run(new Date(Date.now() - 1).toISOString());
  assert.equal(store.redeemPairing(current.code), null);
  const revoked = store.createPairing(connection.id, alice.id);
  store.db.prepare('UPDATE connections SET revoked=1 WHERE id=?').run(connection.id);
  assert.equal(store.redeemPairing(revoked.code), null);
});
test('repair keeps archived history and adds an exact profile without exposing keys in listings', async t => {
  const { store, alice, connection } = await fixture(t);
  store.ingest(store.connectionByToken(connection.token), { eventId: 'old', kind: 'create', scope: 'account', externalId: '1', text: 'Keep me', occurredAt: new Date().toISOString() });
  const pairing = store.createPairing(connection.id, alice.id);
  const paired = store.redeemPairing(pairing.code);
  const [listed] = store.connections(alice.id);
  assert.equal(listed.message_count, 1); assert.ok(listed.last_message_at); assert.ok(listed.paired_at);
  assert.equal(store.messages(alice.id)[0].text, 'Keep me');
  assert.equal(JSON.stringify(listed).includes(paired.token), false);
});
test('actual HTTP pairing endpoint provisions a private local profile, with replay rejected', async t => {
  const { store, alice, bob, connection } = await fixture(t);
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `${origin}/api/connections/${connection.id}/pairing`;
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { Cookie: `afterword=${store.session(bob.id)}` } })).status, 404);
  const { pairing } = await (await fetch(endpoint, { method: 'POST', headers: { Cookie: `afterword=${store.session(alice.id)}` } })).json();
  const paired = await redeemCode(origin, pairing.code);
  await assert.rejects(redeemCode(origin, pairing.code), /already used/);
  const directory = mkdtempSync(join(tmpdir(), 'afterword-pair-test-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const local = savePairedProfile(directory, origin, paired);
  assert.equal(local.config.token, paired.token);
  assert.equal(statSync(join(local.directory, 'config.json')).mode & 0o777, 0o600);
  const replaced = { ...paired, token: 'aw_' + randomBytes(32).toString('base64url') };
  assert.equal(savePairedProfile(directory, origin, replaced).config.token, replaced.token);
  assert.throws(() => savePairedProfile(directory, origin, { ...paired, connectionId: 'different' }), /another source/);
  assert.equal(JSON.parse(readFileSync(join(local.directory, 'config.json'))).token, replaced.token);
});
test('pairing refuses insecure or credential-bearing remote URLs', () => {
  assert.equal(serverOrigin('https://archive.example/'), 'https://archive.example');
  assert.equal(serverOrigin('http://localhost:4318'), 'http://localhost:4318');
  for (const url of ['http://example.com', 'https://secret@example.com', 'https://example.com/path', 'https://example.com?token=x', 'not a url']) assert.throws(() => serverOrigin(url));
});

test('personal browser onboarding provisions Discord while preserving other pairing and existing records', async t => {
  const { store, alice, connection } = await fixture(t);
  const legacy = store.createConnection(alice.id, 'discord', 'Earlier Discord source');
  store.ingest(store.connectionByToken(legacy.token), { eventId: 'legacy', kind: 'create', scope: 'test', externalId: '1', text: 'Existing record', occurredAt: new Date().toISOString() });
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `afterword=${store.session(alice.id)}`, 'Content-Type': 'application/json' };
  const creation = await fetch(`${origin}/api/connections`, { method: 'POST', headers, body: JSON.stringify({ platform: 'discord', name: 'My Discord' }) });
  assert.equal(creation.status, 201);
  assert.equal((await creation.json()).connection.platform, 'discord');
  assert.equal((await fetch(`${origin}/api/connections/${legacy.id}/pairing`, { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(`${origin}/api/connections/${connection.id}/pairing`, { method: 'POST', headers })).status, 200);
  const listed = await (await fetch(`${origin}/api/messages`, { headers })).json();
  assert.equal(listed.messages[0].text, 'Existing record');
  assert.equal(store.connections(alice.id).length, 3);
});
