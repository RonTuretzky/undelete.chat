import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, createPublicKey, publicEncrypt, createHash, constants } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket, { WebSocketServer } from 'ws';
import { linkDiscord } from '../server/hosted/discord-auth.mjs';
import { startDiscordCloud, discordGateway } from '../server/hosted/discord.mjs';
import { openQueue } from '../companion/queue.mjs';
import { eventSchema } from '../server/store.mjs';

const until = async fn => { const end = Date.now() + 6000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('Expected state did not arrive'); };
async function server(t, accept) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }); await once(wss, 'listening');
  wss.on('connection', accept);
  t.after(async () => { for (const c of wss.clients) c.terminate(); await new Promise(r => wss.close(r)); });
  return (url, options) => { assert.equal(options.followRedirects, false); return new WebSocket(`ws://127.0.0.1:${wss.address().port}`, options); };
}
const send = (socket, value) => socket.send(JSON.stringify(value));
test('Discord QR approval verifies the RSA challenge and exchanges only the approved ticket', async t => {
  let encrypt, qr, requests = 0, waiting = false;
  const nonce = randomBytes(32), token = 'private-discord-session';
  const socketFactory = await server(t, socket => {
    send(socket, { op: 'hello', heartbeat_interval: 1000, timeout_ms: 60_000 });
    socket.on('message', data => {
      const p = JSON.parse(data);
      if (p.op === 'init') {
        const key = createPublicKey({ key: Buffer.from(p.encoded_public_key, 'base64'), type: 'spki', format: 'der' });
        encrypt = value => publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(value)).toString('base64');
        send(socket, { op: 'nonce_proof', encrypted_nonce: encrypt(nonce) });
      }
      if (p.op === 'nonce_proof') {
        assert.equal(p.proof, createHash('sha256').update(nonce).digest('base64url'));
        send(socket, { op: 'pending_remote_init', fingerprint: 'approved-test-fingerprint' });
        send(socket, { op: 'pending_ticket', encrypted_user_payload: encrypt('100:0:avatar:Owner') });
        send(socket, { op: 'pending_login', ticket: 'phone-approved-ticket' });
      }
    });
  });
  const result = await linkDiscord({ socketFactory, onQR: value => { qr = value; }, onWaiting: () => { waiting = true; }, fetcher: async (url, options) => {
    requests++;
    assert.equal(url, 'https://discord.com/api/v9/users/@me/remote-auth/login');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { ticket: 'phone-approved-ticket' });
    return { ok: true, json: async () => ({ encrypted_token: encrypt(token) }) };
  } });
  assert.equal(qr, 'https://discord.com/ra/approved-test-fingerprint'); assert.equal(waiting, true); assert.equal(requests, 1);
  assert.deepEqual(result, { token, accountId: '100' });
});
test('cancelling Discord phone linking closes the pending connection without requesting a session', async t => {
  const controller = new AbortController(); let opened = false, requested = false, client;
  const socketFactory = await server(t, socket => { client = socket; opened = true; });
  const linking = linkDiscord({ signal: controller.signal, socketFactory, onQR() {}, fetcher: async () => { requested = true; } });
  await until(() => opened); controller.abort();
  await assert.rejects(linking, /cancelled/); await until(() => client.readyState === WebSocket.CLOSED);
  assert.equal(requested, false);
});
test('cloud Discord records only personal history, resumes after disconnect, and encrypts the saved session', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-discord-cloud-'));
  const queue = openQueue(directory, randomBytes(32).toString('hex'));
  t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }); });
  const packets = [], events = []; let connections = 0, resumed = false, stop, current;
  queue.set('discord-auth-session', { token: 'private-discord-session', accountId: '100' });
  const socketFactory = await server(t, socket => {
    current = socket; connections++; send(socket, { op: 10, d: { heartbeat_interval: 1000 } });
    socket.on('message', data => {
      const p = JSON.parse(data); packets.push(p);
      if (p.op === 1) send(socket, { op: 11 });
      if (p.op === 2) {
        assert.equal(p.d.presence.status, 'invisible');
        send(socket, { op: 0, t: 'READY', s: 1, d: { user: { id: '100', username: 'Me' }, session_id: 'gateway-session', resume_gateway_url: 'wss://gateway-us-east1-b.discord.gg/', private_channels: [{ id: '200', type: 1, recipients: [{ id: '101', username: 'Friend' }] }] } });
        send(socket, { op: 0, t: 'MESSAGE_CREATE', s: 2, d: { id: '300', channel_id: '200', content: 'original cloud DM', author: { id: '101', username: 'Friend' }, timestamp: '2026-09-10T16:00:00Z' } });
        send(socket, { op: 0, t: 'MESSAGE_CREATE', s: 3, d: { id: '301', guild_id: '900', channel_id: '901', content: 'never capture server content' } });
      }
      if (p.op === 6) {
        assert.equal(p.d.seq, 3); assert.equal(p.d.session_id, 'gateway-session'); resumed = true;
        send(socket, { op: 0, t: 'MESSAGE_UPDATE', s: 4, d: { id: '300', channel_id: '200', content: 'edited cloud DM', edited_timestamp: '2026-09-10T16:01:00Z' } });
        send(socket, { op: 0, t: 'MESSAGE_DELETE', s: 5, d: { id: '300', channel_id: '200' } });
        send(socket, { op: 0, t: 'RESUMED', s: 6, d: {} });
      }
    });
  });
  const ctx = { queue, health() {}, fail(message) { assert.fail(message); }, capture(e) { eventSchema.parse(e); queue.add(e); events.push(e); }, onStop(fn) { stop = fn; } };
  await startDiscordCloud(ctx, { socketFactory, retryBase: 10, authorize: () => assert.fail('Saved session must not ask for QR') });
  await until(() => queue.get('discord-gateway-session')?.seq === 3); current.close(4000, 'test outage');
  await until(() => resumed && queue.get('discord-gateway-session')?.seq === 6);
  assert.deepEqual(events.map(e => e.kind), ['create', 'edit', 'delete']);
  assert.equal(events[1].authorName, 'Friend'); assert.ok(packets.every(p => [1, 2, 6].includes(p.op)));
  await stop();
  assert.equal(connections, 2);
  const raw = readFileSync(join(directory, 'queue.sqlite')); assert.equal(raw.includes(Buffer.from('private-discord-session')), false); assert.equal(raw.includes(Buffer.from('original cloud DM')), false);
});
test('Discord revocation stops capture, removes the invalid token, and never retries authorization automatically', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-discord-revoked-')), queue = openQueue(directory, randomBytes(32).toString('hex'));
  t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }); });
  queue.set('discord-auth-session', { token: 'revoked', accountId: '100' }); let failure, count = 0;
  const socketFactory = await server(t, socket => { count++; socket.close(4004); });
  const stop = await startDiscordCloud({ queue, health() {}, fail: message => { failure = message; } }, { socketFactory, retryBase: 10 });
  await until(() => failure); await stop(); assert.match(failure, /revoked/);
  assert.equal(queue.get('discord-auth-session'), undefined); assert.equal(count, 1);
});
test('Discord resume URLs cannot redirect a personal token to another service', () => {
  for (const url of ['ws://gateway.discord.gg/', 'wss://gateway.discord.gg.evil.test/', 'wss://secret@gateway.discord.gg/', 'wss://127.0.0.1/', 'wss://gateway.discord.gg:8443/', 'wss://gateway.discord.gg/private']) assert.throws(() => discordGateway(url));
  assert.equal(discordGateway('wss://gateway-us-east1-b.discord.gg/'), 'wss://gateway-us-east1-b.discord.gg/?v=9&encoding=json');
});
test('a relink cannot replace the Discord account bound to a source', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'afterword-discord-binding-')), queue = openQueue(directory, randomBytes(32).toString('hex'));
  t.after(() => { queue.close(); rmSync(directory, { recursive: true, force: true }); });
  let failure;
  const stop = await startDiscordCloud({ queue, config: { discordAccountId: '100' }, health() {}, fail: message => { failure = message; } }, { authorize: async () => ({ token: 'other-account-session', accountId: '999' }), socketFactory() { assert.fail('Must not open the other account’s Gateway'); } });
  await stop(); assert.match(failure, /different Discord account/); assert.equal(queue.get('discord-auth-session'), undefined);
});
