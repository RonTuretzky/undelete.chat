// Disposable UI preview. The provider is a local fixture subprocess; no real
// messaging service, account, or credentials are used.
import { randomBytes, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createStore } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { createCollectorManager } from '../../server/hosted/manager.mjs';
import { openQueue } from '../../companion/queue.mjs';

const directory = mkdtempSync(join(tmpdir(), 'afterword-capacity-preview-')), key = randomBytes(32).toString('hex');
const store = createStore(join(directory, 'afterword.sqlite'), key);
const username = 'capacitypreview', password = 'Only-local-capacity-test-123!';
const user = await store.createUser(username, password);
const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Synthetic Telegram').token);
const event = n => ({ eventId: `preview-${n}`, externalId: String(n), scope: 'personal', kind: 'create', authorName: 'Sam Rivers',
  chatName: 'Synthetic planning chat', text: `Trip note ${n}: let’s meet by the station and bring our tickets.`, occurredAt: new Date(Date.now() - 10000 + n * 100).toISOString() });
for (let n = 1; n <= 5; n++) store.ingest(source, event(n));
const used = store.capacity.usage(user.id).usedBytes;
store.db.prepare("UPDATE users SET archive_limit_bytes=? WHERE id=?").run(used + 100, user.id);
store.db.prepare("UPDATE connections SET collector='hosted',paired_at=?,health='connected' WHERE id=?").run(new Date().toISOString(), source.id);
store.saveHostedConfig(source.id, {});
const derived = createHmac('sha256', Buffer.from(key, 'hex')).update('afterword-hosted:' + source.id).digest('hex');
const queue = openQueue(join(directory, 'collectors', source.id), derived);
queue.set('authorized', true); queue.add({ ...event(1), eventId: 'pending-edit', kind: 'edit', text: 'An edit waiting safely in the encrypted queue.' }); queue.close();
const collectors = createCollectorManager(store, { directory, key, runtimeDirectory: join(directory, 'runtime'), telegramApiId: 123, telegramApiHash: '0'.repeat(32),
  spawn(_file, args, options) { return fork(new URL('./hosted-worker.mjs', import.meta.url), args, options); } });
await collectors.restore();
const origins = [], server = createApp(store, { collectors, origins }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`; origins.push(url);
console.log(JSON.stringify({ url, username, password, synthetic: true }));
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  if (line.trim() === 'near') {
    store.db.prepare('UPDATE users SET archive_limit_bytes=? WHERE id=?').run(Math.ceil(store.capacity.usage(user.id).usedBytes / .9), user.id);
    console.log('Synthetic archive now uses 90% of its allowance.');
  }
});
process.once('SIGINT', async () => {
  input.close(); await collectors.close(); server.closeAllConnections();
  server.close(() => { store.close(); rmSync(directory, { recursive: true, force: true }); console.log('Capacity preview stopped.'); });
});
