// Run explicitly: node --max-old-space-size=64 tests/fixtures/archive-scale.mjs
// Uses synthetic data in a temporary directory; never connects to a platform.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { performance } from 'node:perf_hooks';
import { createStore } from '../../server/store.mjs';

const folder = await mkdtemp(join(tmpdir(), 'afterword-scale-'));
const count = Number(process.argv[2] || 12000);
assert.ok(Number.isSafeInteger(count) && count >= 1000 && count <= 100000);
const store = createStore(join(folder, 'synthetic.sqlite'), randomBytes(32).toString('hex'));
let peakHeap = 0, peakRSS = 0;
const sample = () => { const memory = process.memoryUsage(); peakHeap = Math.max(peakHeap, memory.heapUsed); peakRSS = Math.max(peakRSS, memory.rss); };
const timer = setInterval(sample, 10);
try {
  // Durability is irrelevant for a disposable benchmark fixture, and keeping
  // fsync out of fixture construction makes read timings reproducible.
  store.db.exec('PRAGMA synchronous=OFF');
  const user = await store.createUser('benchmark', 'synthetic-private-password');
  const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Synthetic').token);
  const occurredAt = new Date(Date.now() - 1000).toISOString();
  const insert = (externalId, eventId, kind, text) => store.ingest(source, { externalId, eventId, kind, text,
    scope: 'synthetic', authorName: 'Fixture person', chatName: 'Fixture conversation', occurredAt });
  const buildStarted = performance.now();
  for (let n = 0; n < count; n++) {
    insert(String(n), `${n}-create`, 'create', `Original needle ${n} ` + 'a'.repeat(2048));
    insert(String(n), `${n}-edit`, 'edit', `Replacement ${n} ` + 'b'.repeat(2048));
    if (n % 100 === 0) sample();
  }
  let historyId;
  for (let n = 0; n < 2000; n++) historyId = insert('many-versions', `history-${n}`, n ? 'edit' : 'create', 'c'.repeat(40000)).id;
  const buildMs = performance.now() - buildStarted;
  const pageStarted = performance.now();
  const page = await store.listMessages(user.id);
  assert.equal(page.messages.length, 50); assert.equal(page.total, count + 1);
  const pageMs = performance.now() - pageStarted;
  const searchStarted = performance.now();
  const searched = await store.listMessages(user.id, { q: 'Original needle', offset: 50 });
  assert.equal(searched.total, count); assert.equal(searched.messages.length, 50);
  const searchMs = performance.now() - searchStarted;
  const historyStarted = performance.now();
  const recentHistory = await store.messageHistory(historyId, user.id);
  const oldestHistory = await store.messageHistory(historyId, user.id, { offset: 1980, snapshot: recentHistory.history.snapshot });
  assert.equal(recentHistory.message.versions.length, 30);
  assert.equal(recentHistory.message.versions.at(-1).versionNumber, 2000);
  assert.equal(oldestHistory.message.versions.length, 20);
  assert.equal(oldestHistory.message.versions[0].versionNumber, 1);
  const historyMs = performance.now() - historyStarted;
  let bytes = 0;
  const exportStarted = performance.now();
  await pipeline(Readable.from(store.exportArchive(user.id), { objectMode: false, highWaterMark: 65536 }),
    new Writable({ highWaterMark: 65536, write(chunk, _encoding, done) { bytes += chunk.length; sample(); done(); } }));
  const exportMs = performance.now() - exportStarted;
  assert.ok(bytes > count * 6000);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM archive_selection').get().n, 0);
  console.log(JSON.stringify({ messages: count + 1, versions: count * 2 + 2000,
    heapLimitMB: 64, buildMs: Math.round(buildMs), pageMs: Math.round(pageMs), searchMs: Math.round(searchMs),
    historyPagesMs: Math.round(historyMs), historyTextCharsPerVersion: 40000,
    exportMs: Math.round(exportMs), exportedMB: +(bytes / 1048576).toFixed(1),
    peakHeapMB: +(peakHeap / 1048576).toFixed(1), peakRSSMB: +(peakRSS / 1048576).toFixed(1) }, null, 2));
} finally {
  clearInterval(timer); store.close(); await rm(folder, { recursive: true, force: true });
}
