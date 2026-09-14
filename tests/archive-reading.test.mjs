import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const event = (id, kind = 'create', text = 'Original', seconds = 0) => ({
  kind, eventId: `${id}-${kind}-${seconds}`, externalId: String(id), scope: 'personal',
  chatName: 'Friends', authorName: 'Alice', ...(kind !== 'delete' ? { text } : {}),
  occurredAt: new Date(Date.now() - 60_000 + seconds * 1000).toISOString(),
});
async function fixture(t) {
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  const user = await store.createUser('alice', 'a-long-private-password');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Personal').token);
  t.after(() => store.close());
  return { store, user, source };
}
// Only deleted messages are archived; held messages stay out of every listing and count.
const archived = messages => messages.filter(m => !m.held);
const oldStats = all => { const messages = archived(all); return { total: messages.length, edited: messages.filter(m => m.versions.some(v => v.kind === 'edit')).length,
  edits: messages.reduce((n, m) => n + m.versions.filter(v => v.kind === 'edit').length, 0),
  deleted: messages.length, saved: messages.filter(m => m.saved).length,
  versions: messages.reduce((n, m) => n + m.versionCount, 0), disappearing: messages.filter(m => m.disappearing).length, held: all.length - messages.length }; };
const remove = (store, source, id, seconds = 1) => store.ingest(source, event(id, 'delete', undefined, seconds));

test('SQL pagination decrypts only the requested page and keeps metadata counts tenant-scoped', async t => {
  const { store, user, source } = await fixture(t);
  for (let n = 0; n < 61; n++) { store.ingest(source, event(n)); remove(store, source, n); }
  const other = await store.createUser('bob', 'a-different-long-password');
  const otherSource = store.connectionByToken(store.createConnection(other.id, 'signal', 'Private').token);
  store.ingest(otherSource, event('bob')); remove(store, otherSource, 'bob');
  const original = archived(store.messages(user.id)), expected = original.slice(0, 50).map(({ versions, ...m }) => m);
  const damaged = original.at(-1);
  store.db.prepare("UPDATE events SET payload='invalid-ciphertext' WHERE message_id=? OR connection_id=?").run(damaged.id, otherSource.id);
  const page = await store.listMessages(user.id);
  assert.deepEqual(page.messages, expected);
  assert.equal(page.total, 61);
  assert.deepEqual(page.stats, oldStats(original));
  assert.ok(page.messages.every(m => !('versions' in m)));
  await assert.rejects(store.listMessages(user.id, { offset: 50 }), 'selected corruption must not be hidden');
  assert.equal((await store.listMessages(user.id, { offset: 500 })).messages.length, 0);
  const plan = store.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM messages WHERE user_id=? ORDER BY last_seen DESC,id LIMIT 50').all(user.id);
  assert.ok(plan.some(row => row.detail.includes('messages_page')));
  assert.ok(plan.every(row => !row.detail.includes('TEMP B-TREE')));
});

test('metadata stays correct through out-of-order events, duplicate replay, bookmarks and deletion', async t => {
  const { store, user, source } = await fixture(t);
  const deletion = event('one', 'delete', undefined, 30);
  store.ingest(source, deletion);
  store.ingest(source, event('one', 'edit', 'second', 20));
  const first = event('one', 'create', 'first');
  const { id } = store.ingest(source, first);
  store.ingest(source, event('one', 'edit', 'between', 10));
  store.ingest(source, first); store.ingest(source, deletion);
  store.ingest(source, event('two', 'edit', 'original unavailable', 10)); remove(store, source, 'two', 20);
  store.db.prepare('UPDATE messages SET saved=1 WHERE id=?').run(id);
  assert.deepEqual(store.messageStats(user.id), oldStats(store.messages(user.id)));
  const saved = await store.listMessages(user.id, { status: 'deleted', saved: true });
  assert.equal(saved.total, 1); assert.equal(saved.messages[0].versionCount, 3);
  assert.equal(saved.messages[0].originalMissing, false);
  assert.equal((await store.listMessages(user.id)).messages.find(m => m.externalId === 'two').originalMissing, true);
  store.ingest(source, event('three', 'create', 'never deleted'));
  assert.equal((await store.listMessages(user.id)).total, 2, 'a held message is not listed'); assert.equal(store.messageStats(user.id).held, 1);
  store.forgetMessage(id, user.id);
  assert.deepEqual(store.messageStats(user.id), oldStats(store.messages(user.id)));
});

test('encrypted search preserves substring, old revision and name matching without retaining plaintext indexes', async t => {
  const { store, user, source } = await fixture(t);
  for (let n = 0; n < 67; n++) {
    store.ingest(source, event(n, 'create', `Old private needle ${n}`));
    store.ingest(source, event(n, 'edit', `Replacement ${n}`, 10)); remove(store, source, n, 20);
  }
  const other = await store.createUser('bob', 'a-different-long-password');
  const otherSource = store.connectionByToken(store.createConnection(other.id, 'telegram', 'Private').token);
  store.ingest(otherSource, event('other', 'create', 'Old private needle')); remove(store, otherSource, 'other');
  const all = archived(store.messages(user.id));
  for (const q of ['PRIVATE NEEDLE', 'Alice Friends', 'needle 0 Replacement 0', 'no match']) {
    const expected = all.filter(m => `${m.authorName} ${m.chatName} ${m.versions.map(v => v.text || '').join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    const page = await store.listMessages(user.id, { q, offset: 50, platform: 'telegram', status: 'deleted' });
    assert.equal(page.total, expected.length);
    assert.deepEqual(page.messages.map(m => m.id), expected.slice(50, 100).map(m => m.id));
  }
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0);
  assert.equal(JSON.stringify(store.db.prepare('SELECT payload FROM events').all()).includes('private needle'), false);
  const controller = new AbortController();
  const pending = store.listMessages(user.id, { q: 'needle', signal: controller.signal });
  setImmediate(() => controller.abort());
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0, 'cancelled searches release temporary identifiers');
});

test('existing archives migrate counts without rewriting ciphertext and reopening is idempotent', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'afterword-migration-')); t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'archive.sqlite'), key = randomBytes(32).toString('hex');
  let store = createStore(path, key);
  const user = await store.createUser('alice', 'a-long-private-password');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Personal').token);
  store.ingest(source, event('one', 'delete', undefined, 20));
  store.ingest(source, event('one', 'edit', 'changed', 10));
  store.ingest(source, event('one'));
  const expected = archived(store.messages(user.id)), payloads = store.db.prepare('SELECT payload FROM events ORDER BY id').all();
  store.close();
  const legacy = new DatabaseSync(path);
  legacy.exec('DROP INDEX messages_status_page; ALTER TABLE messages DROP COLUMN status; ALTER TABLE messages DROP COLUMN version_count; ALTER TABLE messages DROP COLUMN edit_count;');
  legacy.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    store = createStore(path, key);
    try {
      assert.deepEqual(store.messageStats(user.id), oldStats(expected));
      assert.deepEqual((await store.listMessages(user.id)).messages, expected.map(({ versions, ...m }) => m));
      assert.deepEqual(store.db.prepare('SELECT payload FROM events ORDER BY id').all(), payloads);
    } finally { store.close(); }
  }
});

test('page previews retain metadata fallbacks and chronological ordering for partial events', async t => {
  const { store, user, source } = await fixture(t);
  const sameTime = new Date(Date.now() - 10_000).toISOString();
  store.ingest(source, { ...event('one', 'edit', 'latest'), occurredAt: sameTime, authorName: '', chatName: '' });
  store.ingest(source, { ...event('one', 'create', 'original'), occurredAt: sameTime });
  store.ingest(source, { ...event('one', 'delete'), occurredAt: sameTime });
  store.ingest(source, { ...event('missing', 'delete'), authorName: 'Deleted sender', chatName: '' });
  for (let n = 0; n < 80; n++) store.ingest(source, { ...event('blank', 'edit', 'revision', n / 2), authorName: '', chatName: '', chatId: 'fallback chat' });
  remove(store, source, 'blank', 41);
  const expected = archived(store.messages(user.id)).map(({ versions, ...m }) => m);
  assert.deepEqual((await store.listMessages(user.id)).messages, expected);
  assert.equal((await store.listMessages(user.id, { q: 'fallback chat' })).total, 1);
});

test('streaming exports retain every version, respect backpressure and clean up on cancellation', async t => {
  const { store, user, source } = await fixture(t);
  for (let n = 0; n < 70; n++) { store.ingest(source, event(n)); remove(store, source, n); }
  for (let n = 1; n <= 80; n++) store.ingest(source, event('many', 'edit', `revision ${n}`, n / 2));
  remove(store, source, 'many', 41);
  const expected = archived(store.messages(user.id));
  let text = '';
  for await (const chunk of store.exportArchive(user.id)) text += chunk;
  assert.deepEqual(JSON.parse(text).messages, expected);
  const damaged = expected.at(-1);
  store.db.prepare("UPDATE events SET payload='invalid-ciphertext' WHERE message_id=?").run(damaged.id);
  const partial = store.exportArchive(user.id);
  for (let n = 0; n < 3; n++) assert.equal((await partial.next()).done, false, 'early chunks do not decrypt later messages');
  await partial.return();
  const controller = new AbortController(), iterator = store.exportArchive(user.id, { signal: controller.signal });
  await iterator.next();
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, expected.length);
  controller.abort();
  await assert.rejects(iterator.next(), { name: 'AbortError' });
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0);
  const abandoned = store.exportArchive(user.id); await abandoned.next(); await abandoned.return();
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0);
});

test('HTTP archive reads validate pagination, stream downloads and release slots after cancellation', async t => {
  const { store, user, source } = await fixture(t);
  for (let n = 0; n < 60; n++) { store.ingest(source, event(n)); remove(store, source, n); }
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api`, headers = { Cookie: `afterword=${store.session(user.id)}` };
  assert.equal((await fetch(base + '/messages?offset=Infinity', { headers })).status, 400);
  const page = await (await fetch(base + '/messages?offset=50', { headers })).json();
  assert.equal(page.messages.length, 10); assert.equal(page.stats.total, 60);
  const exported = await fetch(base + '/export', { headers });
  assert.equal(exported.status, 200); assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.deepEqual((await exported.json()).messages, archived(store.messages(user.id)));
  assert.equal((await fetch(base + '/export')).status, 401);
  const realList = store.listMessages;
  const pending = [];
  store.listMessages = (_id, { signal }) => new Promise((resolve, reject) => {
    pending.push(resolve); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const controllers = [new AbortController(), new AbortController()];
  const requests = controllers.map(controller => fetch(base + '/messages', { headers, signal: controller.signal }).catch(e => e));
  while (pending.length < 2) await new Promise(resolve => setImmediate(resolve));
  const busy = await fetch(base + '/messages', { headers });
  assert.equal(busy.status, 429); assert.equal(busy.headers.get('retry-after'), '2');
  controllers.forEach(controller => controller.abort()); await Promise.all(requests);
  store.listMessages = realList;
  let recovered;
  for (let n = 0; n < 30; n++) {
    recovered = await fetch(base + '/messages', { headers });
    if (recovered.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(recovered.status, 200); await recovered.arrayBuffer();
});

test('an edit during download cannot make a preview disagree with its exported versions', async t => {
  const { store, user, source } = await fixture(t);
  for (let n = 0; n < 3; n++) { store.ingest(source, event(n)); remove(store, source, n); }
  const before = archived(store.messages(user.id)), first = before[0], removed = before.at(-1);
  const iterator = store.exportArchive(user.id);
  let output = (await iterator.next()).value;
  output += (await iterator.next()).value;
  store.ingest(source, event(first.externalId, 'edit', 'arrived during the download', 10));
  store.forgetMessage(removed.id, user.id);
  for await (const chunk of iterator) output += chunk;
  const exported = JSON.parse(output).messages;
  assert.deepEqual(exported[0], first);
  assert.ok(exported.every(message => message.id !== removed.id), 'a later deleted item is not recreated from a queued metadata batch');
  assert.equal(store.message(first.id, user.id).versionCount, 2, 'capture continued while the export was open');
});

test('deletion of an in-progress exported message fails the download rather than completing truncated history', async t => {
  const { store, user, source } = await fixture(t);
  const { id } = store.ingest(source, event('one'));
  store.ingest(source, event('one', 'edit', 'changed', 10)); remove(store, source, 'one', 20);
  const iterator = store.exportArchive(user.id);
  await iterator.next(); await iterator.next(); await iterator.next();
  store.forgetMessage(id, user.id);
  await assert.rejects(iterator.next(), /archive changed/);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0);
});
