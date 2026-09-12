import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { checkPassword } from '../server/crypto.mjs';
test('recovery keys are hashed, single-use under concurrency, rotate and revoke all previous sessions', async t => {
  const store = createStore(':memory:', randomBytes(32).toString('hex')); t.after(() => store.close());
  const user = await store.createUser('alice', 'initial-password-123');
  const session = store.session(user.id), key = store.createRecoveryKey(user.id);
  assert.equal(store.getUser(user.id).recovery_enabled, 1);
  assert.equal(store.userByName('alice').recovery_hash.includes(key), false);
  assert.equal(await store.recoverAccount('alice', key+'x', 'new-password-123'), null);
  const results = await Promise.all([store.recoverAccount('alice', key, 'new-password-123'), store.recoverAccount('alice', key, 'new-password-123')]);
  assert.equal(results.filter(Boolean).length, 1);
  const result = results.find(Boolean); assert.notEqual(result.recoveryKey, key);
  assert.equal(store.authenticate(session), null);
  assert.ok(await checkPassword('new-password-123', store.userByName('alice').password));
  assert.equal(await store.recoverAccount('alice', key, 'another-password-123'), null);
  assert.ok(await store.recoverAccount('alice', result.recoveryKey, 'another-password-123'));
});

test('HTTP recovery flow issues a replacement key, rejects old keys, and guards authenticated key replacement', async t => {
  const { createApp } = await import('../server/app.mjs');
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const server = createApp(store, { origins: ['http://localhost'] }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, cookie, origin) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  const registered = await post('/auth/register', { username: 'customer', password: 'long-original-password' });
  assert.equal(registered.status, 201);
  const cookie = registered.headers.get('set-cookie').split(';')[0], first = await registered.json();
  assert.match(first.recoveryKey, /^awr_/); assert.equal(first.user.recovery_hash, undefined);
  assert.equal((await post('/auth/recovery-key', { password: 'long-original-password' })).status, 401);
  assert.equal((await post('/auth/recovery-key', { password: 'incorrect' }, cookie)).status, 403);
  assert.equal((await post('/auth/recovery-key', { password: 'long-original-password' }, cookie, 'https://bad.example')).status, 403);
  const reset = await post('/auth/recover', { username: 'customer', password: 'long-replacement-password', recoveryKey: first.recoveryKey });
  assert.equal(reset.status, 200); const replacement = await reset.json(); assert.notEqual(replacement.recoveryKey, first.recoveryKey);
  assert.equal((await post('/auth/recover', { username: 'customer', password: 'another-long-password', recoveryKey: first.recoveryKey })).status, 403);
  assert.equal((await post('/auth/recovery-key', { password: 'long-replacement-password' }, cookie)).status, 401);
  const newCookie = reset.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/auth/recovery-key', { password: 'long-replacement-password' }, newCookie)).status, 200);
});

test('repeated failed sign-ins throttle the username itself, below the per-address limit', async t => {
  const { createApp } = await import('../server/app.mjs');
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  await store.createUser('target', 'the-real-password');
  const server = createApp(store, { origins: ['http://localhost'] }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = password => fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Target', password }) });
  for (let n = 0; n < 10; n++) assert.equal((await login('wrong-password-' + n)).status, 401);
  const blocked = await login('the-real-password');
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '900');
  assert.equal((await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'someone-else', password: 'irrelevant-pw' }) })).status, 401, 'other usernames are unaffected');
});
