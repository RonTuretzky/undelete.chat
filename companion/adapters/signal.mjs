import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import qr from 'qrcode-terminal';
import { signalEvent } from './normalize.mjs';

// Observed provisioning window before signal-cli rejects finishLink, and the
// number of fresh codes offered before the sign-in is reported as failed.
export const linkWindowMs = 115_000, maxLinkAttempts = 5;
export async function startSignal(ctx) {
  const directory = join(ctx.directory, 'signal-session');
  const nativeOptions = ctx.hosted && process.env.SIGNAL_NATIVE_DIR ? [`-Djava.io.tmpdir=${process.env.SIGNAL_NATIVE_DIR}`] : [];
  const child = spawn('signal-cli', [...nativeOptions, '--config', directory, 'jsonRpc'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let counter = 0, stopped = false, stopPromise;
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopped = true;
    for (const p of pending.values()) p.reject(new Error('Shutting down'));
    pending.clear();
    // Wait for signal-cli to finish writing before the worker checkpoints and
    // removes its private working files.
    stopPromise = new Promise(resolve => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
    return stopPromise;
  };
  ctx.onStop?.(stop);
  ctx.signal?.addEventListener('abort', stop, { once: true });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = String(++counter);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Signal request timed out. Restart setup to try again.')); }, 180_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  child.stdin.on('error', () => {});
  const failed = message => { ctx.health('error', message); for (const p of pending.values()) p.reject(new Error(message)); pending.clear(); };
  child.on('error', () => failed('signal-cli is unavailable. Install it and restart the companion.'));
  child.on('exit', () => { if (!stopped) { failed('signal-cli stopped. Restart the companion to resume capture.'); ctx.fatal?.('Signal stopped unexpectedly. Reconnecting.'); } });
  // Never forward raw signal-cli diagnostics: they can contain message/account data.
  child.stderr.on('data', () => {});
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.id && pending.has(String(message.id))) {
      const item = pending.get(String(message.id)); pending.delete(String(message.id));
      if (message.error) item.reject(new Error(`Signal RPC ${message.error.code}; check your linked device.`)); else item.resolve(message.result);
    }
    if (message.method === 'receive') {
      const envelope = message.params?.envelope || message.params?.result?.envelope;
      if (envelope) {
        const event = signalEvent(envelope, id => ctx.queue.get(`signal-alias:${id}`) || id, (alias, id) => ctx.queue.set(`signal-alias:${alias}`, id));
        if (event) ctx.capture(event);
      }
    }
  });
  const ready = await new Promise(resolve => { child.once('spawn', () => resolve(true)); child.once('error', () => resolve(false)); });
  if (!ready) throw new Error('Install signal-cli, then run the companion again.');
  try {
    const accounts = await rpc('listAccounts');
    if (!accounts?.length) {
      // Signal closes a provisioning link about two minutes after it is issued;
      // signal-cli then fails finishLink. Issue a fresh code instead of failing
      // the whole sign-in while the user is still on the linking screen. The
      // worker's own setup deadline bounds the total wait.
      for (let attempt = 1; ; attempt++) {
        const { deviceLinkUri } = await rpc('startLink');
        if (ctx.showQR) ctx.showQR(deviceLinkUri, Date.now() + linkWindowMs);
        else { console.log('Scan in Signal → Settings → Linked devices:'); qr.generate(deviceLinkUri, { small: true }); }
        ctx.health('waiting', ctx.hosted ? 'Scan this code in Signal → Linked devices' : 'Scan the QR code in your companion terminal');
        try { await rpc('finishLink', { deviceLinkUri, deviceName: ctx.hosted ? 'Undelete Cloud' : 'Undelete companion' }); break; }
        catch (error) {
          if (stopped || attempt >= maxLinkAttempts || !/^Signal RPC /.test(error.message)) throw error;
          ctx.health('waiting', 'The previous code expired. A fresh code is being prepared.');
        }
      }
    }
    await ctx.checkpoint?.();
    ctx.health('connected', 'Signal linked device connected');
  } catch (error) { await stop(); throw error; }
  return () => { lines.close(); return stop(); };
}
