// Simulated provider behind a real subprocess/IPC and durable encrypted queue.
// This verifies hosting and routing; it does not claim live platform coverage.
import { openQueue } from '../../companion/queue.mjs';
let queue, timer, queueOnStop;
const send = m => process.send?.(m);
function flush() { const events = queue.pending(); if (events.length) send({ type: 'events', events }); }
process.on('message', message => {
  if (message.type === 'start') {
    queue = openQueue(message.directory, message.key);
    queue.set('restarts', (queue.get('restarts') || 0) + 1);
    if (queue.get('authorized')) send({ type: 'health', health: 'connected', detail: 'Restored saved session' });
    else {
      send({ type: 'qr', value: 'private-pairing-fixture', expiresAt: new Date(Date.now() + 60_000).toISOString() });
      send({ type: 'health', health: 'waiting', detail: 'Scan the fixture code' });
    }
    timer = setInterval(() => { send({ type: 'ping', queued: queue.count() }); flush(); }, 200);
  }
  if (message.type === 'fixture-prompt') send({ type: 'prompt', prompt: { id: message.id, label: 'Account password', secret: true, expiresAt: new Date(Date.now() + 60_000).toISOString() } });
  if (message.type === 'reply') {
    queue.set('authorized', true);
    for (const [i, kind] of ['create', 'edit', 'delete'].entries()) queue.add({ eventId: 'fixture-' + kind, kind, externalId: 'same-id', scope: 'account', chatName: 'My own chat', text: kind === 'delete' ? undefined : i ? 'Revised private text' : 'Original private text', occurredAt: new Date(Date.now() - 3000 + i * 1000).toISOString() });
    send({ type: 'health', health: 'connected', detail: 'Provider session connected' }); flush();
  }
  if (message.type === 'ack') for (const r of message.results) if (!r.error) queue.ack(r.eventId);
  if (message.type === 'fixture-queue-on-stop') queueOnStop = message.event;
  if (message.type === 'fixture-exit') { clearInterval(timer); queue?.close(); process.exit(message.code); }
  if (message.type === 'stop') { clearInterval(timer); if (queueOnStop) queue.add(queueOnStop); queue?.close(); process.exit(0); }
});
