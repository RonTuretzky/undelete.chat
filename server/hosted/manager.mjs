import { fork } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import QRCode from 'qrcode';

const supported = ['telegram', 'signal', 'whatsapp', 'discord'];
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
      lastSeen: c?.last_seen || null, enabled: enabled(id) };
  }
  function launch(c, failures = 0) {
    if (closing || workers.get(c.id)?.child) return;
    const config = { ...store.hostedConfig(c.id) };
    if (c.platform === 'telegram') Object.assign(config, { apiId: options.telegramApiId, apiHash: options.telegramApiHash });
    const state = { child: null, qr: null, prompt: null, failures, lastPing: Date.now(), stopping: false, qrSequence: 0, timer: null };
    workers.set(c.id, state);
    update(c.id, 'reconnecting', 'Starting your hosted connection');
    const runtimeDirectory = join(runtime, c.id);
    // Each process receives only its own derived key/config. No server secrets,
    // archive cookie, bearer token, or other account's session is inherited.
    rmSync(runtimeDirectory, { recursive: true, force: true });
    mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
    const env = { PATH: process.env.PATH, HOME: runtimeDirectory, TMPDIR: runtimeDirectory, LANG: 'C.UTF-8', NODE_ENV: 'production' };
    const nativeDirectory = c.platform === 'signal' && signalNative ? join(signalNative, c.id) : null;
    if (nativeDirectory) {
      rmSync(nativeDirectory, { recursive: true, force: true });
      mkdirSync(nativeDirectory, { recursive: true, mode: 0o700 });
      env.SIGNAL_NATIVE_DIR = nativeDirectory;
    }
    const child = (options.spawn || fork)(new URL('./worker.mjs', import.meta.url), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: process.platform !== 'win32', env,
      execArgv: ['--max-old-space-size=192']
    });
    state.child = child;
    child.on('message', async message => {
      if (closing || state.stopping || workers.get(c.id) !== state) return;
      const current = connection(c.id);
      if (!current || current.collector !== 'hosted' || !enabled(c.id)) return;
      try {
        if (message.type === 'ping') {
          state.lastPing = Date.now();
          store.db.prepare('UPDATE connections SET last_seen=?,queued=? WHERE id=?').run(new Date().toISOString(), Number(message.queued) || 0, c.id);
          if (message.rejected) update(c.id, 'error', 'Some events need attention. Please contact support.', message.queued);
        }
        if (message.type === 'health' && ['connected', 'reconnecting', 'waiting', 'error'].includes(message.health)) {
          update(c.id, message.health, String(message.detail || '').slice(0, 300), current.queued);
          if (message.health === 'connected') { state.qr = null; state.prompt = null; state.failures = 0; ++state.qrSequence; }
        }
        if (message.type === 'qr' && typeof message.value === 'string' && message.value.length <= 6000) {
          const sequence = ++state.qrSequence;
          const expiresAt = new Date(Math.min(Date.parse(message.expiresAt), Date.now() + 180_000)).toISOString();
          const image = await QRCode.toDataURL(message.value, { margin: 3, width: 320, errorCorrectionLevel: 'M' });
          if (sequence === state.qrSequence && workers.get(c.id) === state && !state.stopping) state.qr = { image, expiresAt };
        }
        if (message.type === 'prompt') {
          const p = message.prompt;
          state.qr = null; ++state.qrSequence;
          state.prompt = p ? { id: String(p.id).slice(0, 64), label: String(p.label).slice(0, 200), secret: !!p.secret, expiresAt: p.expiresAt } : null;
        }
        if (message.type === 'config') {
          // Only application configuration is persisted here; login responses are
          // sent once over IPC and never stored or added to the application logs.
          const clean = { ...store.hostedConfig(c.id) };
          if (c.platform === 'telegram') { clean.apiId = Number(message.config?.apiId); clean.apiHash = String(message.config?.apiHash || ''); }
          const discordAccount = message.config?.discordAccountId;
          if (c.platform === 'discord' && typeof discordAccount === 'string' && /^\d{1,24}$/.test(discordAccount) && (!clean.discordAccountId || clean.discordAccountId === discordAccount)) clean.discordAccountId = discordAccount;
          store.saveHostedConfig(c.id, clean);
        }
        if (message.type === 'events' && Array.isArray(message.events) && message.events.length <= 50) {
          const results = message.events.map(event => {
            try { return { eventId: event?.eventId, ...store.ingest(current, event) }; }
            catch { return { eventId: event?.eventId, error: 'Invalid event' }; }
          });
          send(state, { type: 'ack', results });
        }
      } catch { update(c.id, 'error', 'The hosted connection needs attention. Please try again.'); }
    });
    const exited = code => {
      if (state.child !== child || workers.get(c.id) !== state) return;
      state.child = null; state.qr = null; state.prompt = null; ++state.qrSequence;
      rmSync(runtimeDirectory, { recursive: true, force: true });
      if (nativeDirectory) rmSync(nativeDirectory, { recursive: true, force: true });
      if (closing || state.stopping || !connection(c.id) || !enabled(c.id)) return;
      if (code === 2) { if (connection(c.id)?.health !== 'error') update(c.id, 'error', 'Sign-in was not completed. Choose Try again to connect.'); return; }
      update(c.id, 'reconnecting', 'Connection interrupted. Retrying automatically.');
      state.timer = setTimeout(() => { const current = connection(c.id); if (current && enabled(c.id)) launch(current, state.failures + 1); }, Math.min(60_000, 2000 * 2 ** Math.min(state.failures, 5)));
    };
    child.once('exit', exited);
    child.once('error', () => exited(1));
    send(state, { type: 'start', platform: c.platform, config, paused: c.paused, directory: join(root, c.id), runtimeDirectory,
      key: createHmac('sha256', Buffer.from(options.key, 'hex')).update('afterword-hosted:' + c.id).digest('hex') });
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
    capabilities() { return { enabled: true, platforms: { telegram: !!options.telegramApiId && !!options.telegramApiHash, signal: options.signalAvailable !== false, whatsapp: true, discord: options.discordPersonalCloud === true }, maxConnectionsPerAccount: 4 }; },
    status: publicState,
    start(id, userId, { restart = false, relink = false, consent = false, experimentalConsent = false } = {}) {
      return serialize(id, async () => {
        const c = store.connection(id, userId);
        if (!c || c.revoked) throw failure('Connection not found.', 404);
        if (!supported.includes(c.platform)) throw failure('Hosted capture is not available for this platform.');
        if (!manager.capabilities().platforms[c.platform]) throw failure('This platform is not configured on the server yet.', 503);
        const savedConfig = store.hostedConfig(id);
        if (c.platform === 'discord' && !savedConfig.discordRiskAcceptedAt && !experimentalConsent) throw failure('Acknowledge Discord’s account restrictions before using this experimental connection.', 400);
        if (c.collector !== 'hosted' && !consent) throw failure('Confirm that Afterword may run this connection on the server.', 400);
        const active = store.hostedConnections().filter(x => x.enabled);
        if (!enabled(id) && active.length + reservations.size >= maxCollectors) throw failure('Hosted capacity is full. Please contact support.', 503);
        if (!enabled(id) && active.filter(x => x.user_id === userId).length + [...reservations.values()].filter(x => x === userId).length >= 4) throw failure('This account already has four hosted connections.');
        if (workers.get(id)?.child && !restart && !relink) return publicState(id);
        reservations.set(id, userId);
        try {
        await stop(id);
        if (relink) rmSync(join(root, id), { recursive: true, force: true });
        store.saveHostedConfig(id, { ...savedConfig, ...(c.platform === 'discord' && experimentalConsent ? { discordRiskAcceptedAt: new Date().toISOString() } : {}) });
        store.db.prepare('UPDATE hosted_collectors SET enabled=1 WHERE connection_id=?').run(id);
        store.db.prepare("UPDATE connections SET collector='hosted',token_hash=NULL,paired_at=?,last_seen=?,health='waiting',detail='Starting hosted sign-in' WHERE id=?")
          .run(new Date().toISOString(), new Date().toISOString(), id);
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
    suspend(id) { return serialize(id, async () => { store.db.prepare('UPDATE hosted_collectors SET enabled=0 WHERE connection_id=?').run(id); await stop(id); update(id, 'waiting', 'Hosted capture is stopped'); }); },
    remove(id) { return serialize(id, async () => { store.db.prepare('DELETE FROM hosted_collectors WHERE connection_id=?').run(id); await stop(id); rmSync(join(root, id), { recursive: true, force: true }); }); },
    async restore() {
      const connections = store.hostedConnections();
      // The cache contains only native library copies. Clear leftovers from
      // crashes before launching any workers; sessions live in encrypted queues.
      if (signalNative) for (const entry of readdirSync(signalNative, { withFileTypes: true })) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) rmSync(join(signalNative, entry.name), { recursive: true, force: true });
      const valid = new Set(connections.map(c => c.id));
      for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name) && !valid.has(entry.name)) rmSync(join(root, entry.name), { recursive: true, force: true });
      for (const c of connections) if (c.enabled) launch(c);
    },
    async close() { closing = true; clearInterval(watchdog); await Promise.all([...workers.keys()].map(stop)); }
  };
  const watchdog = setInterval(() => {
    for (const [id, state] of workers) if (state.child && !state.stopping && Date.now() - state.lastPing > 45_000) {
      update(id, 'reconnecting', 'Connection stopped responding. Restarting.');
      serialize(id, async () => { await stop(id); const c = connection(id); if (c && enabled(id) && !closing) launch(c, state.failures + 1); }).catch(() => {});
    }
  }, 10_000).unref();
  return manager;
}
