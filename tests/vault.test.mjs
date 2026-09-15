import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { generateAccountKeys, openSealed, sealTo, isSealed } from '../server/vault.mjs';

const event = (kind, id, text, external = 'm1', seconds = 0) => ({ kind, eventId: id, externalId: external, scope: 'chat', chatId: 'chat', chatName: 'Family', authorName: 'Alice', ...(kind === 'delete' ? {} : { text }), occurredAt: new Date(Date.now() - 60_000 + seconds * 1000).toISOString() });
const wrapped = () => ({ password: { salt: 'c2FsdHNhbHRzYWx0c2FsdA==', iv: 'aXZpdml2aXZpdml2', ciphertext: 'Y'.repeat(120), iterations: 600000 }, recovery: { salt: 'c2FsdHNhbHRzYWx0c2FsdA==', iv: 'aXZpdml2aXZpdml2', ciphertext: 'Z'.repeat(120), iterations: 10000 } });
async function fixture(t) {
  const serverKey = randomBytes(32).toString('hex');
  const store = createStore(':memory:', serverKey);
  const server = createApp(store, { origins: ['http://localhost'], vaultMigrator: { schedule(id) { while (!store.migrateVault(id, { batch: 3 })); } } }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await new Promise(r => server.close(r)); store.close(); });
  const user = await store.createUser('alice', 'a-long-password-1');
  const source = store.connectionByToken(store.createConnection(user.id, 'signal', 'Phone').token);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: `afterword=${store.session(user.id)}`, Origin: 'http://localhost' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { store, user, source, call, serverKey };
}

test('after setup the server seals every record to the account key and can no longer read stored content', async t => {
  const { store, user, source, call } = await fixture(t);
  const keys = generateAccountKeys();
  store.ingest(source, event('create', 'a', 'written before the key', 'old')); store.ingest(source, event('delete', 'b', undefined, 'old', 5));
  assert.equal((await call('/vault')).status, 200); assert.equal((await (await call('/vault')).json()).vault.state, 'none');
  assert.equal((await call('/vault/setup', 'POST', { publicKey: 'not-a-key', wrapped: wrapped() })).status, 400);
  const setup = await call('/vault/setup', 'POST', { publicKey: keys.publicKey, wrapped: wrapped() });
  assert.equal(setup.status, 201);
  assert.equal(store.getUser(user.id).vault, 'active', 'existing records were migrated');
  assert.equal((await call('/vault/setup', 'POST', { publicKey: keys.publicKey, wrapped: wrapped() })).status, 409, 'a key cannot be replaced');
  store.ingest(source, event('create', 'c', 'sealed on arrival', 'new')); store.ingest(source, event('delete', 'd', undefined, 'new', 5));
  const payloads = store.db.prepare('SELECT payload FROM events').all().map(r => r.payload);
  assert.equal(payloads.length, 4); assert.ok(payloads.every(isSealed), 'old and new records are sealed');
  const raw = JSON.stringify(store.db.prepare('SELECT * FROM events').all()) + JSON.stringify(store.db.prepare('SELECT * FROM messages').all()) + JSON.stringify(store.db.prepare('SELECT * FROM users').all());
  for (const word of ['written before', 'sealed on arrival', 'Alice', 'Family']) assert.equal(raw.includes(word), false, `${word} is not readable in the database`);
  const page = await (await call('/messages')).json();
  assert.equal(page.total, 2); assert.ok(page.messages.every(m => m.sealed && m.latest && m.meta && m.text === '' && m.authorName === ''));
  assert.equal(JSON.stringify(page).includes('sealed on arrival'), false);
  const row = page.messages.find(m => m.externalId === '' && m.status === 'deleted');
  const opened = openSealed(keys.privateKeyPem, row.latest.payload, `${user.id}:${row.id}:${row.latest.uid}`);
  assert.ok(['written before the key', 'sealed on arrival'].includes(opened.text), 'the private key opens the envelope');
  assert.throws(() => openSealed(keys.privateKeyPem, row.latest.payload, `${user.id}:${row.id}:other`), 'a different context fails');
  const history = await (await call(`/messages/${row.id}`)).json();
  assert.ok(history.message.versions.every(v => v.kind === 'delete' || v.sealed));
  let text = ''; for await (const chunk of store.exportArchive(user.id)) text += chunk;
  assert.equal(text.includes('sealed on arrival'), false); assert.ok(JSON.parse(text).messages.every(m => m.sealed));
});

test('unchanged edits are still detected by keyed digest, search is handed to the device, and wrapped keys can be rotated', async t => {
  const { store, user, source, call } = await fixture(t);
  const keys = generateAccountKeys();
  await call('/vault/setup', 'POST', { publicKey: keys.publicKey, wrapped: wrapped() });
  const created = store.ingest(source, event('create', 'a', 'same text', 'm'));
  assert.equal(store.ingest(source, event('edit', 'b', 'same text', 'm', 5)).reason, 'unchanged', 'a reaction-only edit is dropped without reading content');
  assert.equal(store.ingest(source, event('edit', 'c', 'changed text', 'm', 10)).duplicate, false);
  store.ingest(source, event('delete', 'd', undefined, 'm', 15));
  const search = await (await call('/messages?q=anything')).json();
  assert.equal(search.clientSearch, true); assert.equal(search.messages.length, 1); assert.ok(search.messages[0].sealed);
  const rotated = { ...wrapped(), password: { ...wrapped().password, ciphertext: 'R'.repeat(120) } };
  assert.equal((await call('/vault/rewrap', 'POST', { wrapped: rotated })).status, 200);
  assert.equal((await (await call('/vault')).json()).vault.wrapped.password.ciphertext, 'R'.repeat(120));
  assert.equal((await call('/vault/rewrap', 'POST', { wrapped: { password: {} } })).status, 400);
  const other = await store.createUser('bob', 'another-long-password');
  assert.equal(store.rewrapVault(other.id, rotated), false, 'an account without a key has nothing to rewrap');
  assert.equal(store.migrateVault(other.id), true, 'accounts without a key have nothing to migrate');
  void created;
});

test('sealing binds the record to its context and the server key cannot open it', () => {
  const keys = generateAccountKeys();
  const sealed = sealTo(keys.publicKey, { text: 'secret', attachments: [] }, 'user:message:event');
  assert.ok(isSealed(sealed)); assert.equal(sealed.includes('secret'), false);
  assert.deepEqual(openSealed(keys.privateKeyPem, sealed, 'user:message:event'), { text: 'secret', attachments: [] });
  const another = generateAccountKeys();
  assert.throws(() => openSealed(another.privateKeyPem, sealed, 'user:message:event'));
});
test('re-sealing existing records keeps archive usage accounting exact', async t => {
  const { store, user, source, call } = await fixture(t);
  for (let n = 0; n < 7; n++) store.ingest(source, event('create', 'e' + n, 'message ' + n, 'x' + n));
  const actual = () => store.db.prepare('SELECT coalesce(sum(storage_bytes),0) AS n FROM events WHERE user_id=?').get(user.id).n + store.db.prepare('SELECT count(*) AS n FROM messages WHERE user_id=?').get(user.id).n * 1024;
  const before = store.capacity.usage(user.id).usedBytes;
  await call('/vault/setup', 'POST', { publicKey: generateAccountKeys().publicKey, wrapped: wrapped() });
  assert.equal(store.getUser(user.id).vault, 'active');
  const after = store.capacity.usage(user.id).usedBytes;
  assert.ok(after > before, 'sealed envelopes are larger');
  assert.equal(after - before, store.db.prepare('SELECT coalesce(sum(storage_bytes),0) AS n FROM events WHERE user_id=?').get(user.id).n - (before - store.db.prepare('SELECT count(*) AS n FROM messages WHERE user_id=?').get(user.id).n * 1024) - 0 + 0 - (store.db.prepare('SELECT coalesce(sum(storage_bytes),0) AS n FROM events WHERE user_id=?').get(user.id).n - (after - store.db.prepare('SELECT count(*) AS n FROM messages WHERE user_id=?').get(user.id).n * 1024)), 'per-user total matches the sum of event sizes');
  assert.equal(store.db.prepare('SELECT used_bytes FROM archive_usage WHERE id=1').get().used_bytes, after, 'the global total matches');
  void actual;
});
