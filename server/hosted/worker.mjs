import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openQueue } from '../../companion/queue.mjs';
import { eventSchema } from '../store.mjs';
import { signalVault } from './signal-vault.mjs';
import { createEphemeralMemory } from '../../companion/ephemeral.mjs';

process.umask(0o077);
let queue, ephemeral, stopAdapter, checkpoint, runtimeDirectory, started = false, stopped = false, paused = false, flushing = false;
let checkpointFailures = 0;
let prompt, pingTimer, flushTimer, checkpointTimer, setupTimer, capacityStopping = false;
const controller = new AbortController();
const send = message => { if (process.connected) process.send(message, () => {}); };
const health = (health, detail = '') => send({ type: 'health', health, detail });
function capacityStop(error) {
  if (stopped || capacityStopping) return;
  capacityStopping = true;
  if (!process.connected) return shutdown(2);
  const fallback = setTimeout(() => shutdown(2), 1000).unref();
  process.send({ type: 'capacity', code: error.code }, () => { clearTimeout(fallback); shutdown(2); });
}
function ask(label, secret = false) {
  if (prompt) return Promise.reject(new Error('A sign-in response is already pending'));
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { prompt = null; send({ type: 'prompt', prompt: null }); reject(new Error('Sign-in timed out')); }, 180_000);
    prompt = { id, resolve, reject, timer };
    send({ type: 'prompt', prompt: { id, label, secret, expiresAt: new Date(Date.now() + 180_000).toISOString() } });
  });
}
async function shutdown(code = 0) {
  if (stopped) return;
  stopped = true; controller.abort();
  for (const timer of [pingTimer, flushTimer, checkpointTimer, setupTimer]) clearInterval(timer);
  if (prompt) { clearTimeout(prompt.timer); prompt.reject(new Error('Stopped')); prompt = null; }
  try { await stopAdapter?.(); await checkpoint?.(); } catch { /* Saved ciphertext remains available for recovery. */ }
  queue?.close();
  if (runtimeDirectory) rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(code);
}
function flush() {
  if (!queue || stopped || flushing) return;
  const events = queue.pending();
  if (!events.length) return;
  flushing = true; send({ type: 'events', events });
}
async function start(input) {
  started = true; paused = !!input.paused; runtimeDirectory = input.runtimeDirectory;
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  queue = openQueue(input.directory, input.key, { minimumFreeBytes: input.minimumFreeBytes });
  queue.retryRejected();
  ephemeral = createEphemeralMemory(queue);
  const config = input.config || {};
  pingTimer = setInterval(() => send({ type: 'ping', queued: queue.count(), rejected: queue.rejected(), ephemeral: ephemeral.count() }), 5000);
  flushTimer = setInterval(flush, 1000);
  setupTimer = setTimeout(() => { health('error', 'Sign-in expired. Choose Try again for a fresh code.'); shutdown(2); }, 10 * 60_000);
  const ctx = {
    config, directory: runtimeDirectory, queue, hosted: true, signal: controller.signal, ask,
    fatal(detail) { health('error', detail); shutdown(1); },
    fail(detail) { health('error', detail); shutdown(2); },
    relink(detail) { health('error', detail); shutdown(3); },
    save(patch) { Object.assign(config, patch); send({ type: 'config', config }); },
    health(state, detail) { if (stopped || capacityStopping) return; if (state === 'connected') clearTimeout(setupTimer); health(state, detail); },
    showQR(value, expiresAt = Date.now() + 55_000) { send({ type: 'qr', value, expiresAt: new Date(expiresAt).toISOString() }); },
    capture(input) {
      if (stopped || paused || capacityStopping) return;
      try { const event = ephemeral.filter(eventSchema.parse(input)); if (event) queue.add(event); }
      catch (error) {
        if (error.capacity) { capacityStop(error); throw error; }
        health('error', 'An event could not be processed. Please contact support.');
      }
    },
    onStop(fn) { stopAdapter = fn; },
    checkpoint: async () => { await checkpoint?.(); }
  };
  if (input.platform === 'signal') {
    const vault = await signalVault(join(runtimeDirectory, 'signal-session'), queue);
    checkpoint = vault.checkpoint;
    // signal-cli writes its database continuously, so a single snapshot can
    // collide with a write. Only three failures in a row are a real problem, and
    // the next success clears the warning.
    checkpointTimer = setInterval(() => checkpoint().then(() => {
      if (checkpointFailures >= 3) health('connected', 'Signal linked device connected');
      checkpointFailures = 0;
    }).catch(error => {
      if (error.capacity) return capacityStop(error);
      if (++checkpointFailures === 3) health('error', 'Signal session could not be saved. Reconnecting if this continues.');
      if (checkpointFailures >= 12) { health('error', 'Signal session could not be saved. Reconnecting.'); shutdown(1); }
    }), 5000);
  }
  const adapters = { telegram: 'startTelegram', signal: 'startSignal', whatsapp: 'startWhatsApp' };
  if (!adapters[input.platform]) throw new Error('Unsupported hosted platform');
  const module = await import(`../../companion/adapters/${input.platform}.mjs`);
  const stop = await module[adapters[input.platform]](ctx);
  if (stopped) { await stop?.(); return; }
  stopAdapter = stop;
  await checkpoint?.();
  flush();
}
process.on('message', message => {
  if (!message || stopped) return;
  if (message.type === 'start' && !started) start(message).catch(error => { if (error.capacity) return capacityStop(error); if (error?.relink) { if (!stopped) health('error', error.message); return shutdown(3); } if (!stopped) health('error', 'Could not complete sign-in. Choose Try again or check the platform guide.'); shutdown(2); });
  if (message.type === 'reply' && prompt?.id === message.id && typeof message.value === 'string') {
    const pending = prompt; prompt = null; clearTimeout(pending.timer);
    send({ type: 'prompt', prompt: null }); pending.resolve(message.value);
  }
  if (message.type === 'ack' && queue) {
    for (const result of message.results || []) {
      if (result.error && result.retryable) continue;
      if (result.error) queue.reject(result.eventId, 'Archive rejected an event'); else queue.ack(result.eventId);
    }
    flushing = false;
  }
  if (message.type === 'pause') paused = !!message.paused;
  if (message.type === 'stop') shutdown();
});
process.on('disconnect', () => shutdown());
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => shutdown());
const unexpected = error => { if (error?.capacity) return capacityStop(error); if (!stopped) health('error', 'Collector stopped unexpectedly. Reconnecting.'); shutdown(1); };
process.on('uncaughtException', unexpected);
process.on('unhandledRejection', unexpected);
