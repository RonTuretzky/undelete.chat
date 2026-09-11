import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { historyComparisons, boundedDiff } from '../web/history-view.mjs';

async function fixture(t) {
  const store = createStore(':memory:', randomBytes(32).toString('hex'));
  t.after(() => store.close());
  const user = await store.createUser('alice', 'a-long-private-password');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Personal').token);
  const base = Date.now() - 3600_000;
  const ingest = (number, kind = number ? 'edit' : 'create', extra = {}) => store.ingest(source, {
    eventId: `event-${number}-${kind}`, externalId: 'message', scope: 'personal', kind,
    text: kind === 'delete' ? undefined : `Captured revision ${number}`, authorName: 'Alice', chatName: 'Friends',
    occurredAt: new Date(base + number * 1000).toISOString(), ...extra,
  });
  return { store, user, source, ingest };
}

test('history pages retain every event and every adjacent comparison across a stable snapshot', async t => {
  const { store, user, ingest } = await fixture(t);
  const { id } = ingest(0);
  for (let n = 1; n < 127; n++) ingest(n, n % 17 === 0 ? 'delete' : 'edit');
  const original = store.message(id, user.id);
  const first = await store.messageHistory(id, user.id);
  assert.equal(first.message.versions.length, 30); assert.equal(first.history.total, 127);
  assert.equal(first.history.previousVersion.versionNumber, first.message.versions.find(v => v.kind !== 'delete').versionNumber - 1);
  ingest(5.5, 'edit', { text: 'A late delivery that belongs on an older page' });
  const received = [], pairs = [];
  let offset = 0;
  do {
    const page = await store.messageHistory(id, user.id, { offset, snapshot: first.history.snapshot });
    assert.equal(page.history.total, original.versions.length);
    assert.ok(page.history.latestSequence > page.history.snapshot);
    assert.ok(page.message.versions.length <= 30);
    received.push(...[...page.message.versions].reverse());
    pairs.push(...historyComparisons(page.message.versions, page.history.previousVersion));
    offset += page.history.pageSize;
    if (!page.history.hasOlder) break;
  } while (true);
  assert.deepEqual(received.map(v => v.sequence), [...original.versions].reverse().map(v => v.sequence));
  const content = original.versions.filter(v => v.kind !== 'delete');
  const expected = content.slice(1).map((version, index) => [content[index].sequence, version.sequence]).reverse();
  assert.deepEqual(pairs.map(({ before, after }) => [before.sequence, after.sequence]), expected);
  assert.ok(pairs.every(({ before, after }) => after.versionNumber === before.versionNumber + 1));
  const refreshed = await store.messageHistory(id, user.id);
  assert.equal(refreshed.history.total, 128);
  assert.equal(refreshed.history.snapshot, refreshed.history.latestSequence);
});

test('bounded history does not decrypt unrelated old ciphertext and all page sizes stay bounded', async t => {
  const { store, user, ingest } = await fixture(t);
  const { id } = ingest(0); ingest(-1, 'delete');
  for (let n = 1; n < 92; n++) ingest(n);
  const oldest = store.message(id, user.id).versions[0].sequence;
  store.db.prepare("UPDATE events SET payload='corrupt old ciphertext' WHERE id=?").run(oldest);
  const page = await store.messageHistory(id, user.id);
  assert.equal(page.message.versions.length, 30);
  assert.equal(page.message.versions.at(-1).versionNumber, 92);
  assert.equal(page.history.previousVersion.versionNumber, 62);
  await assert.rejects(store.messageHistory(id, user.id, { offset: 90 }));
  assert.equal((await store.messageHistory(id, user.id, { offset: 1000 })).message.versions.length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(store.messageHistory(id, user.id, { signal: controller.signal }), { name: 'AbortError' });
});

test('delete-only pages and same-time out-of-order revisions have correct comparison context', async t => {
  const { store, user, ingest } = await fixture(t);
  const when = new Date(Date.now() - 10000).toISOString();
  const { id } = ingest(1, 'edit', { occurredAt: when });
  ingest(0, 'create', { occurredAt: when });
  for (let n = 2; n < 37; n++) ingest(n, 'delete', { occurredAt: when });
  const latest = await store.messageHistory(id, user.id);
  assert.ok(latest.message.versions.every(v => v.kind === 'delete'));
  assert.equal(latest.history.previousVersion, null);
  assert.deepEqual(historyComparisons(latest.message.versions, null), []);
  const older = await store.messageHistory(id, user.id, { offset: 30, snapshot: latest.history.snapshot });
  assert.deepEqual(older.message.versions.slice(0, 2).map(v => [v.kind, v.versionNumber]), [['create', 1], ['edit', 2]]);
  const [pair] = historyComparisons(older.message.versions, older.history.previousVersion);
  assert.equal(pair.before.kind, 'create'); assert.equal(pair.after.kind, 'edit');
});

test('history HTTP access is owner-only, validates cursors and never accepts an unbounded page', async t => {
  const { store, user, ingest } = await fixture(t);
  const { id } = ingest(0); ingest(-1, 'delete');
  for (let n = 1; n < 65; n++) ingest(n);
  const other = await store.createUser('bob', 'another-long-private-password');
  const server = createApp(store).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api/messages/${id}`;
  const headers = { Cookie: `afterword=${store.session(user.id)}` };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: { Cookie: `afterword=${store.session(other.id)}` } })).status, 404);
  for (const query of ['offset=-1', 'offset=1.5', 'snapshot=Infinity', 'snapshot=-4']) assert.equal((await fetch(`${base}?${query}`, { headers })).status, 400);
  const first = await (await fetch(base + '?limit=1000000', { headers })).json();
  assert.equal(first.message.versions.length, 30); assert.equal(first.history.total, 66);
  const oldest = await (await fetch(`${base}?offset=60&snapshot=${first.history.snapshot}`, { headers })).json();
  assert.equal(oldest.message.versions.length, 6); assert.equal(oldest.message.versions.find(v => v.kind !== 'delete').versionNumber, 1);
  assert.equal(oldest.history.hasOlder, false); assert.equal(oldest.history.hasNewer, true);
  store.forgetMessage(id, user.id);
  assert.equal((await fetch(base, { headers })).status, 404);
});

test('large or very different comparisons can fall back without losing either captured text', () => {
  const before = 'before '.repeat(20000), after = 'after '.repeat(20000);
  assert.equal(boundedDiff(before, after), null);
  assert.equal(before.length, 140000); assert.equal(after.length, 120000);
  const parts = boundedDiff('Meet on Thursday', 'Meet on Friday');
  assert.ok(parts.some(part => part.removed && part.value === 'Thursday'));
  assert.ok(parts.some(part => part.added && part.value === 'Friday'));
});
