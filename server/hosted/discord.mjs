import WebSocket from 'ws';
import { PersonalDiscord, AccountChanged } from '../../companion/adapters/discord-personal.mjs';
import { linkDiscord, discordClient, discordAgent, DiscordSignInError } from './discord-auth.mjs';

const gateway = 'wss://gateway.discord.gg/?v=9&encoding=json';
export function discordGateway(value) {
  const url = new URL(value || gateway);
  if (url.protocol !== 'wss:' || !/^gateway(?:-[a-z0-9-]+)?\.discord\.gg$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/') throw new Error('Discord returned an unrecognized Gateway address.');
  return url.origin + '/?v=9&encoding=json';
}
export async function startDiscordCloud(ctx, { socketFactory = (url, options) => new WebSocket(url, options), authorize = linkDiscord, retryBase = 2000 } = {}) {
  const controller = new AbortController();
  let socket, heartbeat, helloTimeout, retry, prune, stopped = false, failures = 0, pending = Promise.resolve();
  const stop = async () => {
    if (stopped) return pending.catch(() => {});
    stopped = true; controller.abort(); for (const timer of [heartbeat, helloTimeout, retry, prune]) clearInterval(timer);
    socket?.terminate(); await pending.catch(() => {});
  };
  ctx.onStop?.(stop); ctx.signal?.addEventListener('abort', stop, { once: true });
  const fail = message => { ctx.fail?.(message); ctx.health('error', message); stop(); };
  let credentials = ctx.queue.get('discord-auth-session');
  if (!credentials?.token) {
    try {
      credentials = await authorize({ signal: controller.signal, onQR: (value, expiry) => { ctx.showQR(value, expiry); ctx.health('waiting', 'Scan this code in Discord → Settings → Scan QR Code'); }, onWaiting: () => ctx.health('waiting', 'Approve Undelete’s Discord session on your phone.') });
      if (stopped) return stop;
    } catch (error) { if (!stopped) fail(error instanceof DiscordSignInError ? error.message : 'Discord sign-in could not be completed. Please try again later.'); return stop; }
  }
  if (ctx.config?.discordAccountId && ctx.config.discordAccountId !== credentials.accountId) { fail('This source belongs to a different Discord account. Create another source for the account you approved.'); return stop; }
  ctx.save?.({ discordAccountId: credentials.accountId });
  ctx.queue.set('discord-auth-session', credentials);
  if (!ctx.queue.get('discord:identity')) ctx.queue.set('discord:identity', { id: credentials.accountId });
  const metadata = { get: key => ctx.queue.get('discord:' + key), set: (key, value) => ctx.queue.set('discord:' + key, value), delete: key => ctx.queue.delete('discord:' + key), clearPrefix: prefix => ctx.queue.clearPrefix('discord:' + prefix) };
  const model = new PersonalDiscord(metadata, event => { if (!stopped) return ctx.capture(event); }, () => { failures = 0; ctx.health('connected', 'Personal Discord session connected · experimental'); });
  const sweep = () => ctx.queue.prunePrefix('discord:message:', Date.now() - 7 * 86400_000);
  sweep(); prune = setInterval(sweep, 60 * 60_000);
  let session = ctx.queue.get('discord-gateway-session');
  function connect() {
    if (stopped) return;
    let url;
    try { url = discordGateway(session?.url); } catch { fail('Discord returned an unrecognized Gateway address. Relink this account.'); return; }
    ctx.health('reconnecting', 'Connecting your personal Discord session');
    const current = socket = socketFactory(url, { headers: { 'User-Agent': discordAgent }, maxPayload: 32 * 1024 * 1024, handshakeTimeout: 15_000, perMessageDeflate: false, followRedirects: false });
    let awaitingAck = false, greeted = false, buffered = 0;
    model.ready = !!session?.id && !!metadata.get('identity');
    const send = (op, d) => { if (!stopped && socket === current && current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ op, d })); };
    const beat = () => { awaitingAck = true; send(1, session?.seq ?? null); };
    helloTimeout = setTimeout(() => current.terminate(), 20_000);
    current.on('error', () => {}); // Close handles retries without logging tokens or payloads.
    current.on('message', data => {
      if (buffered + data.length > 32 * 1024 * 1024) { fail('Discord traffic exceeded this collector’s processing capacity. Capture stopped; please contact support.'); return; }
      buffered += data.length;
      pending = pending.then(async () => {
        if (stopped || socket !== current) return;
        const p = JSON.parse(data.toString());
        if (p.op === 10) {
          const interval = p.d?.heartbeat_interval;
          if (greeted || !Number.isFinite(interval) || interval < 1000 || interval > 120_000) throw new Error('Invalid Discord heartbeat');
          greeted = true; clearTimeout(helloTimeout);
          heartbeat = setInterval(() => { if (awaitingAck) current.terminate(); else beat(); }, interval);
          beat();
          if (session?.id && Number.isSafeInteger(session.seq)) send(6, { token: credentials.token, session_id: session.id, seq: session.seq });
          else send(2, { token: credentials.token, capabilities: 0, properties: discordClient, compress: false, presence: { status: 'invisible', since: 0, activities: [], afk: true }, client_state: { guild_versions: {} } });
        } else if (p.op === 11) awaitingAck = false;
        else if (p.op === 1) beat();
        else if (p.op === 7) current.close(4000, 'Reconnect requested');
        else if (p.op === 9) {
          if (!p.d) { session = null; ctx.queue.delete('discord-gateway-session'); model.ready = false; }
          current.close(4000, 'Session restart');
        } else if (p.op === 0) {
          if (p.t === 'READY') {
            if (p.d?.user?.id !== credentials.accountId || typeof p.d.session_id !== 'string') throw new AccountChanged('Discord identified a different account. Relink the intended account.');
            session = { id: p.d.session_id, url: discordGateway(p.d.resume_gateway_url), seq: null };
          }
          await model.packet(p);
          if (p.t === 'RESUMED') { failures = 0; ctx.health('connected', 'Personal Discord session connected · experimental'); }
          // Save only after captured events enter the encrypted queue. An abrupt
          // exit can replay events, but cannot advance past an unsaved message.
          if (!stopped && session && Number.isSafeInteger(p.s)) { session.seq = p.s; ctx.queue.set('discord-gateway-session', session); }
        }
      }).catch(error => fail(error instanceof AccountChanged ? error.message : 'Discord sent an event this connector could not process. Capture stopped; please contact support.')).finally(() => { buffered -= data.length; });
    });
    current.on('close', code => {
      if (socket !== current || stopped) return;
      clearTimeout(helloTimeout); clearInterval(heartbeat);
      if (code === 4004) { ctx.queue.delete('discord-auth-session'); ctx.queue.delete('discord-gateway-session'); fail('Discord revoked this session. Relink the account to continue.'); return; }
      if ([4010, 4011, 4012, 4013, 4014].includes(code)) { fail('Discord rejected this experimental connection. Please contact support.'); return; }
      if ([4007, 4009].includes(code)) { session = null; ctx.queue.delete('discord-gateway-session'); }
      ctx.health('reconnecting', 'Discord disconnected. Retrying automatically.');
      retry = setTimeout(() => { pending.then(connect).catch(() => {}); }, Math.min(60_000, retryBase * 2 ** Math.min(failures++, 5)));
    });
  }
  connect(); return stop;
}
