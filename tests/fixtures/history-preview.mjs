// Disposable loopback-only UI fixture. Nothing here contacts a messaging platform.
// Start with: node tests/fixtures/history-preview.mjs
// Enter "edit" to simulate a new revision or "fail-next" to test retry handling.
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createStore } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const store = createStore(':memory:', randomBytes(32).toString('hex'));
const username = 'historypreview', password = 'Only-local-history-test-123!';
const user = await store.createUser(username, password);
const source = store.connectionByToken(store.createConnection(user.id, 'telegram', 'Synthetic history').token);
const base = Date.now() - 3600_000;
let sequence = 0;
const capture = (kind, text) => store.ingest(source, { kind, eventId: `fixture-${++sequence}`, externalId: 'preview-message',
  scope: 'personal', authorName: 'Sam Rivers', chatName: 'Planning our trip', text,
  occurredAt: new Date(base + sequence * 1000).toISOString() });
capture('create', 'Let’s meet at the station on Thursday.');
for (let n = 2; n <= 125; n++) capture('edit', `Trip plan ${n}: let’s meet at platform ${n % 4 + 1}, and bring the tickets.`);
capture('delete');
let failNext = false;
const read = store.messageHistory;
store.messageHistory = async (...args) => {
  if (failNext) { failNext = false; throw Object.assign(new Error('History could not be loaded. Please retry.'), { public: true, status: 503 }); }
  return read(...args);
};
const origins = [], app = createApp(store, { origins });
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}`; origins.push(url);
console.log(JSON.stringify({ url, username, password, synthetic: true, events: sequence }));
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  if (line.trim() === 'edit') { capture('edit', `An update received while history was open: ${sequence + 1}.`); console.log('Synthetic edit captured.'); }
  else if (line.trim() === 'fail-next') { failNext = true; console.log('The next history request will fail once.'); }
});
process.once('SIGINT', () => { input.close(); server.closeAllConnections(); server.close(() => { store.close(); console.log('Preview stopped.'); }); });
