import { fork } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import QRCode from 'qrcode';
import { capacityError, capacityMessages, deliveryFailure } from '../capacity.mjs';

const supported = ['telegram', 'signal', 'whatsapp'];
const failure = (message, status = 409) => Object.assign(new Error(message), { status, public: true });
export function createCollectorManager(store, options) {
  const root = resolve(options.directory, 'collectors');
  const runtime = resolve(options.runtimeDirectory || join(tmpdir(), 'afterword-collectors'));
  const signalNative = options.signalNativeDirectory && resolve(options.signalNativeDirectory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  if (signalNative) mkdirSync(signalNative, { recursive: true, mode: 0o700 });
  const workers = new Map(), locks = new Map(), reservations = new Map();
  const maxCollectors = options.maxCollectors ?? 4;
  let closing = false;
  const connection = id => store.db.prepare('SELECT * FROM connections WHERE id=? AND revoked=0').get(id);
  const enabled = id => !!store.db.prepare('SELECT 1 FROM hosted_collectors WHERE connection_id=? AND enabled=1').get(id);
  function queuedCopies(id) {
    const path = join(root, id, 'queue.sqlite');
    if (!existsSync(path)) return 0;
    const queue = new DatabaseSync(path, { readOnly: true });
    try { return queue.prepare('SELECT count(*) AS n FROM queue').get().n; }
    finally { queue.close(); }
  }
  const relinkQueueMessage = 'This connection has unsent events. Free archive space and use Try again to upload them before relinking. If events remain rejected, contact support.';
  const send = (state, message) => { if (state?.child?.connected) state.child.send(message, () => {}); };
  const update = (id, health, detail, queued = 0) => store.db.prepare('UPDATE connections SET health=?,detail=?,last_seen=?,queued=? WHERE id=? AND revoked=0 AND collector=?').run(health, detail, new Date().toISOString(), queued, id, 'hosted');
  const serialize = (id, fn) => {
    const previous = locks.get(id) || Promise.resolve();
    const result = previous.catch(() => {}).then(fn);
    locks.set(id, result);
    result.finally(() => { if (locks.get(id) === result) locks.delete(id); }).catch(() => {});
    return result;
  };
  function publicState(id) {
    const c = connection(id), state = workers.get(id);
    const active = !!state?.child;
    const qr = state?.qr && Date.parse(state.qr.expiresAt) > Date.now() ? state.qr : null;
    return { mode: c?.collector === 'hosted' ? 'hosted' : 'local', running: active, health: c?.health || 'waiting',
      detail: c?.detail || '', paused: !!c?.paused, qr, prompt: state?.prompt || null,
      lastSeen: c?.last_seen || null, enabled: enabled(id), capacityReason: c?.capacity_reason || null };
  }
  // Repeated failures back off to a quarter hour so a platform-side wait (for
  // example a Telegram flood limit) is not hammered with fresh connections.
  const backoff = failures => Math.min(15 * 60_000, 2000 * 2 ** Math.min(failures, 9));
  const quietly = fn => { try { return fn(); } catch { /* Logged by the caller's state; never crash the supervisor. */ } };
  function launch(c, failures = 0) {
    if (closing || workers.get(c.id)?.child) return;
    const state = { child: null, qr: null, prompt: null, failures, lastPing: Date.now(), stopping: false, qrSequence: 0, timer: null };
    workers.set(c.id, state);
    const runtimeDirectory = join(runtime, c.id);
    const nativeDirectory = c.platform === 'signal' && signalNative ? join(signalNative, c.id) : null;
    let child;
    try {
      const config = { ...store.hostedConfig(c.id) };
      if (c.platform === 'telegram') Object.assign(config, { apiId: options.telegramApiId, apiHash: options.telegramApiHash });
      update(c.id, 'reconnecting', 'Starting your hosted connection');
      // Each process receives only its own derived key/config. No server secrets,
      // archive cookie, bearer token, or other account's session is inherited.
      rmSync(runtimeDirectory, { recursive: true, force: true });
      mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
      const env = { PATH: process.env.PATH, HOME: runtimeDirectory, TMPDIR: runtimeDirectory, LANG: 'C.UTF-8', NODE_ENV: 'production' };
      if (nativeDirectory) {
        rmSync(nativeDirectory, { recursive: true, force: true });
        mkdirSync(nativeDirectory, { recursive: true, mode: 0o700 });
        env.SIGNAL_NATIVE_DIR = nativeDirectory;
      }
      child = (options.spawn || fork)(new URL('./worker.mjs', import.meta.url), [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: process.platform !== 'win32', env,
        execArgv: ['--max-old-space-size=192']
      });
      state.child = child;
      state.startMessage = { type: 'start', platform: c.platform, config, paused: c.paused, directory: join(root, c.id), runtimeDirectory,
        minimumFreeBytes: store.capacity.limits.minimumFreeBytes,
        key: createHmac('sha256', Buffer.from(options.key, 'hex')).update('afterword-hosted:' + c.id).digest('hex') };
    } catch {
      // A full runtime disk, an undecryptable configuration, or a fork failure
      // must not crash the server; retry with backoff while the source stays enabled.
      if (workers.get(c.id) !== state) return;
      quietly(() => update(c.id, 'reconnecting', 'Could not start the hosted connection. Retrying automatically.'));
      state.timer = setTimeout(() => {
        if (workers.get(c.id) !== state || state.stopping || closing) return;
        workers.delete(c.id);
        quietly(() => { const current = connection(c.id); if (current && enabled(c.id)) launch(current, failures + 1); });
      }, backoff(failures));
      return;
    }
    child.on('message', async message => {
      if (closing || state.stopping || workers.get(c.id) !== state) return;
      try {
        const current = connection(c.id);
        if (!current || current.collector !== 'hosted' || !enabled(c.id)) return;
        if (message.type === 'ping') {
          state.lastPing = Date.now();
          store.db.prepare('UPDATE connections SET last_seen=?,queued=? WHERE id=?').run(new Date().toISOString(), Number(message.queued) || 0, c.id);
          if (message.rejected) update(c.id, 'error', 'Some events need attention. Please contact support.', message.queued);
        }
        if (message.type === 'health' && ['connected', 'reconnecting', 'waiting', 'error'].includes(message.health)) {
          state.providerHealth = { health: message.health, detail: String(message.detail || '').slice(0, 300) };
          update(c.id, current.capacity_reason || state.archiveError ? 'error' : message.health,
            capacityMessages[current.capacity_reason] || state.archiveError || state.providerHealth.detail, current.queued);
          if (message.health === 'connected') { state.qr = null; state.prompt = null; state.failures = 0; state.askedOwner = false; ++state.qrSequence; }
          if (message.health === 'waiting') state.askedOwner = true;
        }
        if (message.type === 'qr' && typeof message.value === 'string' && message.value.length <= 6000) {
          state.askedOwner = true;
          const sequence = ++state.qrSequence;
          const expiresAt = new Date(Math.min(Date.parse(message.expiresAt), Date.now() + 180_000)).toISOString();
          const image = await QRCode.toDataURL(message.value, { margin: 3, width: 320, errorCorrectionLevel: 'M' });
          if (sequence === state.qrSequence && workers.get(c.id) === state && !state.stopping) state.qr = { image, expiresAt };
        }
        if (message.type === 'prompt') {
          const p = message.prompt; if (p) state.askedOwner = true;
          state.qr = null; ++state.qrSequence;
          state.prompt = p ? { id: String(p.id).slice(0, 64), label: String(p.label).slice(0, 200), secret: !!p.secret, expiresAt: new Date(Math.min(Date.parse(p.expiresAt) || 0, Date.now() + 180_000)).toISOString() } : null;
        }
        if (message.type === 'config') {
          // Only application configuration is persisted here; login responses are
          // sent once over IPC and never stored or added to the application logs.
          const clean = { ...store.hostedConfig(c.id) };
          if (c.platform === 'telegram') { clean.apiId = Number(message.config?.apiId); clean.apiHash = String(message.config?.apiHash || ''); }
          store.saveHostedConfig(c.id, clean);
        }
        if (message.type === 'events' && Array.isArray(message.events) && message.events.length <= 50) {
          const results = message.events.map(event => {
            try { return { eventId: event?.eventId, ...store.ingest(current, event) }; }
            catch (error) { return { eventId: event?.eventId, ...deliveryFailure(error) }; }
          });
          send(state, { type: 'ack', results });
          const retry = results.find(r => r.error && r.retryable);
          state.archiveError = retry?.error || '';
          if (retry) update(c.id, 'error', retry.error, Math.max(current.queued || 0, results.filter(r => r.error).length));
          else if (state.providerHealth) update(c.id, state.providerHealth.health, state.providerHealth.detail, current.queued);
          const capacity = results.find(r => capacityMessages[r.code]);
          if (capacity) await manager.suspend(c.id, capacity.code);
        }
        if (message.type === 'capacity' && message.code === 'collector_capacity') {
          store.capacity.block(c.id, capacityError(message.code));
          await manager.suspend(c.id, message.code);
        }
      } catch { quietly(() => update(c.id, 'error', 'The hosted connection needs attention. Please try again.')); }
    });
    const exited = code => {
      if (state.child !== child || workers.get(c.id) !== state) return;
      state.child = null; state.qr = null; state.prompt = null; ++state.qrSequence;
      // A crashed worker must not leave signal-cli running against the same account.
      quietly(() => { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); });
      quietly(() => rmSync(runtimeDirectory, { recursive: true, force: true }));
      if (nativeDirectory) quietly(() => rmSync(nativeDirectory, { recursive: true, force: true }));
      try {
        if (closing || state.stopping || !connection(c.id) || !enabled(c.id)) return;
        // Exit code 2 means the worker gave up on sign-in. For a source that was
        // never linked the owner must act; for a source that has connected before,
        // a stalled restart is treated like any other interruption and retried.
        // The owner must act when the platform signed the device out, or when a
        // sign-in code was shown but never scanned. Disable the source so a
        // service restart does not keep requesting codes nobody will scan.
        const needsOwner = code === 3 || code === 2 && (!connection(c.id)?.connected_at || state.askedOwner);
        if (needsOwner) {
          store.db.prepare('UPDATE hosted_collectors SET enabled=0 WHERE connection_id=?').run(c.id);
          if (connection(c.id)?.health !== 'error') update(c.id, 'error', code === 3 ? 'The platform signed this device out. Choose Try again to link it again.' : 'Sign-in was not completed. Choose Try again to connect.');
          return;
        }
        update(c.id, 'reconnecting', code === 2 ? 'Reconnecting took too long. Retrying automatically.' : 'Connection interrupted. Retrying automatically.');
      } catch { /* Database unavailable; the retry below reads fresh state. */ }
      state.timer = setTimeout(() => quietly(() => { const current = connection(c.id); if (current && enabled(c.id) && !closing) launch(current, state.failures + 1); }), backoff(state.failures));
    };
    child.once('exit', exited);
    child.once('error', () => exited(1));
    send(state, state.startMessage); delete state.startMessage;
  }
  async function stop(id) {
    const state = workers.get(id);
    if (!state) return;
    state.stopping = true; clearTimeout(state.timer); state.qr = null; state.prompt = null; ++state.qrSequence;
    const child = state.child;
    if (child) await new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); resolve(); };
      child.once('exit', done);
      timer = setTimeout(() => {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Process already exited. */ }
        done();
      }, 8000);
      send(state, { type: 'stop' });
    });
    workers.delete(id);
    rmSync(join(runtime, id), { recursive: true, force: true });
    if (signalNative) rmSync(join(signalNative, id), { recursive: true, force: true });
  }
  const manager = {
    capabilities() { return { enabled: true, platforms: { telegram: !!options.telegramApiId && !!options.telegramApiHash, signal: options.signalAvailable !== false, whatsapp: true }, maxConnectionsPerAccount: 4 }; },
    status: publicState,
    start(id, userId, { restart = false, relink = false, consent = false } = {}) {
      return serialize(id, async () => {
        const c = store.connection(id, userId);
        if (!c || c.revoked) throw failure('Connection not found.', 404);
        if (!supported.includes(c.platform)) throw failure('Hosted capture is not available for this platform.');
        if (!manager.capabilities().platforms[c.platform]) throw failure('This platform is not configured on the server yet.', 503);
        const savedConfig = store.hostedConfig(id);
        if (c.collector !== 'hosted' && !consent) throw failure('Confirm that undelete.chat may run this connection on the server.', 400);
        const active = store.hostedConnections().filter(x => x.enabled);
        if (!enabled(id) && active.length + reservations.size >= maxCollectors) throw failure('Hosted capacity is full. Please contact support.', 503);
        if (!enabled(id) && active.filter(x => x.user_id === userId).length + [...reservations.values()].filter(x => x === userId).length >= 4) throw failure('This account already has four hosted connections.');
        if (relink && queuedCopies(id)) throw failure(relinkQueueMessage);
        if (workers.get(id)?.child && !restart && !relink) return publicState(id);
        store.capacity.resume(id, userId);
        reservations.set(id, userId);
        try {
        await stop(id);
        // An event can arrive between the initial check and worker shutdown.
        if (relink && queuedCopies(id)) {
          store.db.prepare('UPDATE hosted_collectors SET enabled=0 WHERE connection_id=?').run(id);
          update(id, 'error', relinkQueueMessage, queuedCopies(id));
          throw failure(relinkQueueMessage);
        }
        if (relink) rmSync(join(root, id), { recursive: true, force: true });
        store.saveHostedConfig(id, savedConfig);
        store.db.prepare('UPDATE hosted_collectors SET enabled=1 WHERE connection_id=?').run(id);
        store.db.prepare("UPDATE connections SET collector='hosted',token_hash=NULL,paired_at=?,last_seen=?,health='waiting',connected_at=CASE WHEN ? THEN NULL ELSE connected_at END,detail='Starting hosted sign-in' WHERE id=?")
          .run(new Date().toISOString(), new Date().toISOString(), +(relink || c.collector !== 'hosted'), id);
        store.db.prepare('DELETE FROM pairing_codes WHERE connection_id=?').run(id);
        launch(connection(id));
        return publicState(id);
        } finally { reservations.delete(id); }
      });
    },
    reply(id, userId, promptId, value) {
      const c = store.connection(id, userId), state = workers.get(id);
      if (!c || c.revoked) throw failure('Connection not found.', 404);
      if (!state?.child || !state.prompt || state.prompt.id !== promptId || Date.parse(state.prompt.expiresAt) <= Date.now()) throw failure('That sign-in step expired. Refresh the connection and try again.');
      state.prompt = null; send(state, { type: 'reply', id: promptId, value });
      return { ok: true };
    },
    pause(id, paused) { send(workers.get(id), { type: 'pause', paused }); },
    suspend(id, capacityReason = null) { return serialize(id, async () => {
      store.db.prepare('UPDATE hosted_collectors SET enabled=0 WHERE connection_id=?').run(id);
      await stop(id);
      update(id, capacityReason ? 'error' : 'waiting', capacityMessages[capacityReason] || 'Hosted capture is stopped', connection(id)?.queued || 0);
    }); },
    remove(id) { return serialize(id, async () => { store.db.prepare('DELETE FROM hosted_collectors WHERE connection_id=?').run(id); await stop(id); rmSync(join(root, id), { recursive: true, force: true }); }); },
    async restore() {
      const connections = store.hostedConnections();
      // The cache contains only native library copies. Clear leftovers from
      // crashes before launching any workers; sessions live in encrypted queues.
      if (signalNative) for (const entry of readdirSync(signalNative, { withFileTypes: true })) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) rmSync(join(signalNative, entry.name), { recursive: true, force: true });
      // Runtime directories hold plaintext working files while a worker runs; none may outlive a restart.
      for (const entry of readdirSync(runtime, { withFileTypes: true })) if (entry.isDirectory()) rmSync(join(runtime, entry.name), { recursive: true, force: true });
      const valid = new Set(connections.map(c => c.id));
      for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name) && !valid.has(entry.name)) rmSync(join(root, entry.name), { recursive: true, force: true });
      for (const c of connections) if (c.enabled) launch(c);
    },
    async close() { closing = true; clearInterval(watchdog); await Promise.all([...workers.keys()].map(stop)); }
  };
  const watchdog = setInterval(() => {
    for (const [id, state] of workers) if (state.child && !state.stopping && Date.now() - state.lastPing > 45_000) {
      quietly(() => update(id, 'reconnecting', 'Connection stopped responding. Restarting.'));
      serialize(id, async () => { await stop(id); const c = connection(id); if (c && enabled(id) && !closing) launch(c, state.failures + 1); }).catch(() => {});
    }
  }, 10_000).unref();
  return manager;
}
