import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createDeflate, createZstdCompress, constants } from 'node:zlib';
import { once } from 'node:events';
import { IDBFactory } from 'fake-indexeddb';
import { gatewayDecoder, gatewayOptions, discordPage, PersonalDiscord, AccountChanged } from '../discord-extension/core.mjs';
import { openVault, archiveRequest, archiveOrigin } from '../discord-extension/storage.mjs';
import { createStore, eventSchema } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const ready = { op: 0, t: 'READY', d: { user: { id: '100', username: 'Me' }, token: 'must-never-be-stored', private_channels: [{ id: '200', type: 1, recipients: [{ id: '101', username: 'Friend' }] }, { id: '300', type: 3, name: 'Friends' }], guilds: [{ id: '900', channels: [{ id: '901', type: 0 }] }] } };
const message = { id: '400', channel_id: '200', content: 'first version', author: { id: '101', username: 'Friend' }, timestamp: '2026-09-10T12:00:00.000Z' };
const packet = (t, d) => ({ op: 0, t, d });
async function setup(t) { const factory = new IDBFactory(), vault = await openVault(factory); t.after(() => vault.close()); return { factory, vault }; }

test('browser capture stores personal revisions and deletion, excludes servers, credentials and metadata-only events', async t => {
  const { vault } = await setup(t); const events = []; const model = new PersonalDiscord(vault, async e => { eventSchema.parse(e); events.push(e); });
  await model.packet(ready);
  await model.packet(packet('MESSAGE_CREATE', message));
  await model.packet(packet('MESSAGE_UPDATE', { id: '400', channel_id: '200', content: 'second version', edited_timestamp: '2026-09-10T12:01:00.000Z' }));
  await model.packet(packet('MESSAGE_UPDATE', { id: '400', channel_id: '200', pinned: true }));
  await model.packet(packet('MESSAGE_CREATE', { ...message, id: '401', channel_id: '901', guild_id: '900', content: 'private server content' }));
  await model.packet(packet('MESSAGE_UPDATE', { ...message, id: '401', channel_id: '901' }));
  await model.packet(packet('MESSAGE_CREATE', { ...message, id: '402', flags: 64 }));
  await model.packet(packet('MESSAGE_DELETE', { id: '400', channel_id: '200' }));
  assert.deepEqual(events.map(e => e.kind), ['create', 'edit', 'delete']);
  assert.deepEqual(events.map(e => e.text), ['first version', 'second version', undefined]);
  assert.equal(events[1].authorName, 'Friend'); assert.equal(events[1].chatName, 'Friend');
  assert.equal(await vault.get('message:200:400'), undefined);
  assert.equal(await vault.get('token'), undefined);
  assert.deepEqual(await vault.get('identity'), { id: '100', name: 'Me' });
});
test('account binding survives restart and rejects switching identities before capture', async t => {
  const { vault } = await setup(t); let count = 0;
  await new PersonalDiscord(vault, () => count++).packet(ready);
  const resumed = new PersonalDiscord(vault, () => count++);
  await assert.rejects(resumed.packet({ ...ready, d: { ...ready.d, user: { id: '999', username: 'Other' } } }), AccountChanged);
  await resumed.packet(packet('MESSAGE_CREATE', message)); assert.equal(count, 0);
  await resumed.packet(ready); await resumed.packet(packet('MESSAGE_CREATE', message)); assert.equal(count, 1);
});
test('new group DMs, attachment-only edits and duplicate deletions keep stable event IDs', async t => {
  const { vault } = await setup(t); const events = []; const model = new PersonalDiscord(vault, e => events.push(e));
  await model.packet(ready); await model.packet(packet('CHANNEL_CREATE', { id: '500', type: 3, name: 'New friends' }));
  await model.packet(packet('MESSAGE_CREATE', { ...message, channel_id: '500' }));
  await model.packet(packet('MESSAGE_UPDATE', { id: '400', channel_id: '500', attachments: [{ filename: 'image.png', url: 'https://private-file.invalid/secret', content_type: 'image/png', size: 12 }] }));
  for (let n = 0; n < 2; n++) await model.packet(packet('MESSAGE_DELETE_BULK', { channel_id: '500', ids: ['400'] }));
  assert.equal(events[1].text, 'first version'); assert.equal(events[1].chatName, 'New friends');
  assert.equal(JSON.stringify(events).includes('private-file.invalid'), false);
  assert.equal(events[2].eventId, events[3].eventId);
});
async function compressedChunks(compressor, packets, flushMode) {
  const chunks = []; compressor.on('data', b => chunks.push(b));
  const outputs = [];
  for (const p of packets) { compressor.write(JSON.stringify(p)); await new Promise((resolve, reject) => compressor.flush(flushMode, e => e ? reject(e) : resolve())); outputs.push(Buffer.concat(chunks.splice(0))); }
  compressor.destroy(); return outputs;
}
for (const format of ['zlib-stream', 'zstd-stream']) test(`receives fragmented continuous ${format} packets without changing the Discord socket`, async () => {
  const packets = [ready, packet('MESSAGE_CREATE', { ...message, content: 'emoji 🦊 and braces {"x"}' }), packet('MESSAGE_DELETE', { id: '400', channel_id: '200' })];
  const received = [], decoder = gatewayDecoder({ encoding: 'json', compression: format }, p => received.push(p));
  const chunks = await compressedChunks(format === 'zlib-stream' ? createDeflate() : createZstdCompress(), packets, format === 'zlib-stream' ? constants.Z_SYNC_FLUSH : constants.ZSTD_e_flush);
  for (const chunk of chunks) for (let offset = 0; offset < chunk.length; offset += 7) decoder({ opcode: 2, payloadData: chunk.subarray(offset, offset + 7).toString('base64') });
  assert.deepEqual(received, packets);
});
test('filters Gateway hosts, rejects unsupported encodings and parses joined JSON frames', () => {
  assert.equal(gatewayOptions('wss://gateway.discord.gg.evil.invalid'), null);
  assert.equal(gatewayOptions('wss://elsewhere.invalid'), null);
  assert.equal(discordPage('https://discord.com.evil.invalid/channels/@me'), false);
  assert.equal(discordPage('https://discord.com/channels/@me'), true);
  assert.throws(() => gatewayDecoder({ encoding: 'etf' }, () => {}), /Unsupported/);
  const events = [], decode = gatewayDecoder({ encoding: 'json' }, p => events.push(p));
  decode({ opcode: 1, payloadData: JSON.stringify(ready).slice(0, 17) });
  decode({ opcode: 1, payloadData: JSON.stringify(ready).slice(17) + JSON.stringify(packet('MESSAGE_CREATE', message)) });
  assert.equal(events.length, 2);
});
test('encrypted queue survives restart, rejects tampering, deduplicates and only removes acknowledged events', async t => {
  const factory = new IDBFactory(); let vault = await openVault(factory, 'persistent'); t.after(() => vault.close());
  const events = [], model = new PersonalDiscord(vault, async e => { events.push(e); await vault.add(e); });
  await model.packet(ready); await model.packet(packet('MESSAGE_CREATE', message)); await model.packet(packet('MESSAGE_CREATE', message));
  assert.equal(await vault.count(), 1);
  vault.close(); vault = await openVault(factory, 'persistent');
  assert.equal((await vault.pending())[0].text, 'first version');
  await vault.acknowledge([{ eventId: 'not-sent', id: 'bad' }], events); assert.equal(await vault.count(), 1);
  await vault.acknowledge([{ eventId: events[0].eventId, error: 'rejected' }], events); assert.equal(await vault.count(), 1); assert.equal(await vault.rejected(), 1);
  await vault.acknowledge([{ eventId: events[0].eventId, id: 'stored' }], events); assert.equal(await vault.count(), 0);
  const db = await new Promise(resolve => { const r = factory.open('persistent'); r.onsuccess = () => resolve(r.result); });
  const raw = await new Promise(resolve => { const r = db.transaction('private').objectStore('private').get('identity'); r.onsuccess = () => resolve(r.result); });
  assert.equal('name' in raw, false); assert.ok(raw.ciphertext instanceof ArrayBuffer);
  raw.ciphertext = new Uint8Array(32).buffer;
  await new Promise(resolve => { const tx = db.transaction('private', 'readwrite'); tx.objectStore('private').put(raw, 'identity'); tx.oncomplete = resolve; });
  await assert.rejects(vault.get('identity')); db.close();
});
test('archive URLs cannot leak keys through paths, redirects or insecure remote hosts', async () => {
  for (const value of ['http://remote.example', 'https://secret@archive.example', 'https://archive.example/path', 'https://archive.example?secret=x']) assert.throws(() => archiveOrigin(value));
  let options;
  await archiveRequest({ server: 'https://archive.example', token: 'private' }, '/api/ingest', { events: [] }, async (_url, opts) => { options = opts; return { ok: true, json: async () => ({}) }; });
  assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
});
test('large Unicode messages are split into batches below the archive body limit', async t => {
  const { vault } = await setup(t);
  for (let i = 0; i < 10; i++) await vault.add({ eventId: `large-${i}`, kind: 'create', externalId: String(i), scope: 'dm', text: '🦊'.repeat(50000), occurredAt: new Date().toISOString() });
  const events = await vault.pending();
  assert.ok(events.length > 0 && events.length < 10);
  assert.ok(new TextEncoder().encode(JSON.stringify({ events })).byteLength < 2 * 1024 * 1024);
  assert.equal(await vault.count(), 10);
});
test('extension-origin pairing is platform-bound; real archive retains delivered create/edit/delete history', async t => {
  const store = createStore(':memory:', randomBytes(32).toString('hex')); t.after(() => store.close());
  const user = await store.createUser('browser-test', 'a-long-test-password');
  const server = createApp(store).listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`, headers = { 'Content-Type': 'application/json', Origin: 'chrome-extension://test' };
  const telegram = store.createConnection(user.id, 'telegram', 'Telegram'), wrongCode = store.createPairing(telegram.id, user.id);
  let response = await fetch(origin + '/api/pair', { method: 'POST', headers, body: JSON.stringify({ code: wrongCode.code, platform: 'discord' }) });
  assert.equal(response.status, 400); assert.ok(store.redeemPairing(wrongCode.code, 'telegram'));
  const source = store.createConnection(user.id, 'discord', 'My Discord'), pairing = store.createPairing(source.id, user.id);
  assert.equal(store.redeemPairing(pairing.code), null, 'the terminal companion must not consume an extension pairing code');
  response = await fetch(origin + '/api/pair', { method: 'POST', headers, body: JSON.stringify({ code: pairing.code, platform: 'discord' }) });
  assert.equal(response.status, 200); const config = { server: origin, token: (await response.json()).connection.token };
  assert.equal(store.connections(user.id).find(c => c.id === source.id).collector, 'discord-browser');
  const { vault } = await setup(t), model = new PersonalDiscord(vault, e => vault.add(e));
  await model.packet(ready); await model.packet(packet('MESSAGE_CREATE', message)); await model.packet(packet('MESSAGE_UPDATE', { ...message, content: 'edited', edited_timestamp: '2026-09-10T12:01:00Z' })); await model.packet(packet('MESSAGE_DELETE', { id: message.id, channel_id: message.channel_id }));
  const events = await vault.pending(), result = await archiveRequest(config, '/api/ingest', { events }); await vault.acknowledge(result.results, events);
  assert.equal(await vault.count(), 0); const [archived] = store.messages(user.id);
  assert.equal(archived.status, 'deleted'); assert.equal(archived.versionCount, 2); assert.deepEqual(archived.versions.map(v => v.text).filter(Boolean), ['first version', 'edited']);
});
