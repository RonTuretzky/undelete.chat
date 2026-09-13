import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { nativePushConfig, createNativePush, nativeTokenSchema } from '../server/native-push.mjs';
import { createPushService, loadVapidKeys } from '../server/push.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = key => key.export({ type: 'pkcs8', format: 'pem' });
const env = { APNS_KEY_ID: 'ABC123DEF4', APNS_TEAM_ID: 'TEAM123456', APNS_BUNDLE_ID: 'chat.undelete.app', APNS_PRIVATE_KEY: pem(ec.privateKey).replace(/\n/g, '\\n'),
  FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'undelete-test', client_email: 'fcm@undelete-test.iam.gserviceaccount.com', private_key: pem(rsa.privateKey) }) };
const decode = segment => JSON.parse(Buffer.from(segment, 'base64url').toString());

test('native push configuration validates identifiers and is optional', () => {
  assert.equal(nativePushConfig({}), null);
  const config = nativePushConfig(env);
  assert.equal(config.apns.bundleId, 'chat.undelete.app'); assert.equal(config.apns.host, 'https://api.push.apple.com'); assert.equal(config.fcm.projectId, 'undelete-test');
  assert.equal(nativePushConfig({ ...env, APNS_SANDBOX: 'true' }).apns.host, 'https://api.sandbox.push.apple.com');
  assert.throws(() => nativePushConfig({ ...env, APNS_KEY_ID: 'short' }), /APNS_KEY_ID/);
  assert.throws(() => nativePushConfig({ FCM_SERVICE_ACCOUNT: 'not json' }), /FCM_SERVICE_ACCOUNT/);
  assert.equal(nativeTokenSchema.safeParse({ platform: 'ios', token: 'a'.repeat(64) }).success, true);
  assert.equal(nativeTokenSchema.safeParse({ platform: 'web', token: 'a'.repeat(64) }).success, false);
  assert.equal(nativeTokenSchema.safeParse({ platform: 'android', token: 'bad token with spaces' }).success, false);
});

test('APNs requests carry a signed provider token and map device errors to removal', async () => {
  const calls = [];
  const connect = host => {
    const client = new EventEmitter(); client.close = () => {};
    client.request = headers => {
      const req = new EventEmitter(); req.end = body => { calls.push({ host, headers, body: JSON.parse(body) }); const status = headers[':path'].endsWith('/dead') ? 410 : 200; setImmediate(() => { req.emit('response', { ':status': status }); if (status !== 200) req.emit('data', JSON.stringify({ reason: 'Unregistered' })); req.emit('end'); }); };
      return req;
    };
    return client;
  };
  const push = createNativePush(nativePushConfig(env), { connect, log: { error() {} } });
  await push.send('ios', 'device-token-1', { count: 2, url: '/?source=push' });
  const [call] = calls;
  assert.equal(call.host, 'https://api.push.apple.com'); assert.equal(call.headers['apns-topic'], 'chat.undelete.app'); assert.equal(call.headers[':path'], '/3/device/device-token-1');
  assert.equal(call.body.aps.alert.body, '2 deleted messages were recovered.'); assert.equal(JSON.stringify(call.body).includes('text'), false);
  const [, claims, signature] = call.headers.authorization.replace('bearer ', '').split('.');
  const decoded = decode(claims); assert.equal(decoded.iss, 'TEAM123456');
  const [header, claimsRaw] = call.headers.authorization.replace('bearer ', '').split('.');
  assert.equal(decode(header).kid, 'ABC123DEF4');
  const verifier = createVerify('SHA256'); verifier.update(`${header}.${claimsRaw}`);
  assert.equal(verifier.verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true, 'ES256 signature verifies with the public key');
  await assert.rejects(push.send('ios', 'dead', { count: 1 }), error => error.statusCode === 410);
});

test('FCM requests exchange a service-account assertion for a bearer token once and mark unregistered tokens', async () => {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const assertion = new URLSearchParams(options.body).get('assertion'); const claims = decode(assertion.split('.')[1]);
      assert.equal(claims.iss, 'fcm@undelete-test.iam.gserviceaccount.com'); assert.match(claims.scope, /firebase.messaging/);
      return { ok: true, status: 200, json: async () => ({ access_token: 'access-1', expires_in: 3600 }) };
    }
    const body = JSON.parse(options.body);
    if (body.message.token === 'stale') return { ok: false, status: 404, json: async () => ({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }) };
    return { ok: true, status: 200, json: async () => ({ name: 'projects/undelete-test/messages/1' }) };
  };
  const push = createNativePush(nativePushConfig(env), { fetch, log: { error() {} } });
  await push.send('android', 'fcm-token-1', { count: 1, platform: 'signal' });
  await push.send('android', 'fcm-token-2', { count: 3 });
  assert.equal(requests.filter(r => r.url.includes('oauth2')).length, 1, 'the access token is cached');
  const sent = requests.filter(r => r.url.includes('messages:send')).map(r => JSON.parse(r.options.body).message);
  assert.equal(sent[0].notification.body, 'A deleted signal message was recovered.'); assert.equal(sent[0].android.notification.channel_id, 'recovered');
  assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer access-1');
  await assert.rejects(push.send('android', 'stale', { count: 1 }), error => error.statusCode === 410);
});

test('native tokens register through the API, receive coalesced deliveries alongside web push, and drop when dead', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'undelete-native-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const delivered = []; const dead = new Set();
  const native = { platforms: { ios: true, android: false }, send: async (platform, token, payload) => { if (dead.has(token)) throw Object.assign(new Error('gone'), { statusCode: 410 }); delivered.push({ platform, token, payload }); } };
  const push = createPushService(store, { keys: loadVapidKeys(directory), subject: 'https://undelete.example', send: async () => {}, native, coalesceMs: 20, log: { error() {} } });
  store.hooks.recovered = (userId, platform) => push.recovered(userId, platform);
  const server = createApp(store, { push, origins: ['https://undelete.example'] }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(async () => { await push.close(); await new Promise(r => server.close(r)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const user = await store.createUser('alice', 'a-long-password-1');
  const call = (path, method, body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: `afterword=${store.session(user.id)}`, Origin: 'https://undelete.example' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal((await call('/push/native', 'POST', { platform: 'ios', token: 'ios-token-'.padEnd(64, 'a') })).status, 201);
  assert.equal((await call('/push/native', 'POST', { platform: 'android', token: 'android-token-'.padEnd(64, 'b') })).status, 503, 'unconfigured platforms are refused');
  const info = await (await call('/push', 'GET')).json();
  assert.deepEqual(info.native, { ios: true, android: false }); assert.equal(info.devices.length, 1); assert.equal(JSON.stringify(info).includes('ios-token-'), false, 'tokens are never echoed');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Phone').token);
  const ev = (kind, id, ext) => ({ kind, eventId: id, externalId: ext, scope: 'chat', chatId: 'chat', chatName: 'Chat', authorName: 'A', ...(kind === 'delete' ? {} : { text: 'secret text' }), occurredAt: new Date().toISOString() });
  store.ingest(source, ev('create', 'a', 'm1')); store.ingest(source, ev('delete', 'b', 'm1'));
  await new Promise(r => setTimeout(r, 60));
  assert.equal(delivered.length, 1); assert.equal(delivered[0].platform, 'ios'); assert.deepEqual(delivered[0].payload, { count: 1, platform: 'telegram', url: '/?source=push' });
  dead.add(delivered[0].token);
  store.ingest(source, ev('create', 'c', 'm2')); store.ingest(source, ev('delete', 'd', 'm2'));
  await new Promise(r => setTimeout(r, 60));
  assert.equal(store.nativePushTokens(user.id).length, 0, 'a dead token is removed');
  assert.equal((await (await call('/push/native', 'DELETE', { token: 'ios-token-'.padEnd(64, 'a') })).json()).removed, 0);
});
