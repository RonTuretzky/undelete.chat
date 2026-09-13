import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { createPushService, loadVapidKeys } from '../server/push.mjs';

const event = (kind, id, text, external = 'm1') => ({ kind, eventId: id, externalId: external, scope: 'chat', chatId: 'chat', chatName: 'Chat', authorName: 'A', ...(kind === 'delete' ? {} : { text }), occurredAt: new Date().toISOString() });
const subscription = n => ({ endpoint: `https://push.example/sub/${n}`, keys: { p256dh: 'BExampleKeyThatIsLongEnough_' + n, auth: 'authKey12345' } });
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'undelete-push-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const sent = [], failures = new Map();
  const send = async (sub, payload) => { const fail = failures.get(sub.endpoint); if (fail) throw Object.assign(new Error('gone'), { statusCode: fail }); sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); };
  const push = createPushService(store, { keys: loadVapidKeys(directory), subject: 'https://undelete.example', send, coalesceMs: 30, log: { error() {} } });
  store.hooks.recovered = (userId, platform) => push.recovered(userId, platform);
  const server = createApp(store, { push, origins: ['https://undelete.example'] }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { await push.close(); await new Promise(r => server.close(r)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const user = await store.createUser('alice', 'a-long-password-1'), other = await store.createUser('bob', 'a-long-password-2');
  const call = (path, { method = 'GET', body, who = user } = {}) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: `afterword=${store.session(who.id)}`, Origin: 'https://undelete.example' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const source = store.connectionByToken(store.createConnection(user.id, 'whatsapp', 'Phone').token);
  return { directory, store, push, sent, failures, call, user, other, source };
}

test('VAPID keys are generated once with private permissions and reused', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'undelete-vapid-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = loadVapidKeys(directory, {}), second = loadVapidKeys(directory, {});
  assert.equal(first.publicKey, second.publicKey); assert.match(first.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal(statSync(join(directory, '.vapid.json')).mode & 0o777, 0o600);
  assert.ok(readFileSync(join(directory, '.vapid.json'), 'utf8').includes(first.privateKey));
  assert.deepEqual(loadVapidKeys(directory, { PUSH_VAPID_PUBLIC_KEY: 'pub', PUSH_VAPID_PRIVATE_KEY: 'priv' }), { publicKey: 'pub', privateKey: 'priv' }, 'environment keys win');
});

test('subscriptions are owned, validated, capped, and removable', async t => {
  const f = await fixture(t), { call, store, user, other } = f;
  const info = await (await call('/push')).json();
  assert.equal(info.enabled, true); assert.equal(info.publicKey, f.push.publicKey); assert.deepEqual(info.subscriptions, []);
  assert.equal((await call('/push/subscribe', { method: 'POST', body: { subscription: subscription(1) } })).status, 201);
  assert.equal((await call('/push/subscribe', { method: 'POST', body: { subscription: { ...subscription(2), endpoint: 'http://insecure.example/x' } } })).status, 400);
  assert.equal((await call('/push/subscribe', { method: 'POST', body: { subscription: { endpoint: 'https://push.example/nokeys' } } })).status, 400);
  for (let n = 2; n <= 12; n++) store.addPushSubscription(user.id, subscription(n));
  assert.equal(store.pushSubscriptions(user.id).length, 10, 'newest ten kept per account');
  assert.equal(store.pushSubscriptions(user.id).some(s => s.endpoint.endsWith('/1')), false);
  assert.equal((await (await call('/push/subscribe', { method: 'DELETE', body: { endpoint: 'https://push.example/sub/12' }, who: other })).json()).removed, 0, 'another account cannot remove it');
  assert.equal((await (await call('/push/subscribe', { method: 'DELETE', body: { endpoint: 'https://push.example/sub/12' } })).json()).removed, 1);
  store.addPushSubscription(other.id, subscription(12));
  assert.equal(store.pushSubscriptions(other.id).length, 1, 're-subscribing an endpoint moves it to the new owner');
  store.eraseAccount(other.id);
  assert.equal(store.db.prepare('SELECT count(*) n FROM push_subscriptions WHERE user_id=?').get(other.id).n, 0, 'account deletion removes subscriptions');
});

test('a recovered deletion notifies subscribed devices once per burst without message content', async t => {
  const f = await fixture(t), { store, source, sent, user, push, failures } = f;
  store.addPushSubscription(user.id, subscription(1)); store.addPushSubscription(user.id, subscription(2));
  store.ingest(source, event('create', 'a', 'hello', 'm1')); store.ingest(source, event('create', 'b', 'there', 'm2'));
  assert.equal(sent.length, 0, 'held messages do not notify');
  store.ingest(source, event('delete', 'c', undefined, 'm1')); store.ingest(source, event('delete', 'd', undefined, 'm2'));
  store.ingest(source, event('delete', 'e', undefined, 'm1'));
  await new Promise(r => setTimeout(r, 80));
  assert.equal(sent.length, 2, 'one coalesced notification per device');
  assert.deepEqual(sent[0].payload, { count: 2, platform: 'whatsapp', url: '/?source=push' });
  assert.equal(JSON.stringify(sent).includes('hello'), false);
  failures.set('https://push.example/sub/2', 410);
  store.ingest(source, event('delete', 'f', undefined, 'm3'));
  await new Promise(r => setTimeout(r, 80));
  assert.equal(store.pushSubscriptions(user.id).length, 1, 'a gone endpoint is dropped');
  assert.equal((await (await f.call('/push/test', { method: 'POST', body: {} })).json()).delivered, 1);
  assert.equal(sent.at(-1).payload.title, 'undelete.chat');
  await push.close();
});
