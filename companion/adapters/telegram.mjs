import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { NewMessage, EditedMessage, DeletedMessage } from 'teleproto/events/index.js';
import { telegramEvent } from './normalize.mjs';
import { eventId } from '../queue.mjs';

export async function normalizeTelegramDelivery(event, kind) {
  const m = event.message;
  if (!m || m.action) return null;
  // teleproto puts sender helpers on Message, not NewMessageEvent.
  const [author, chat] = await Promise.all([
    m.getSender().catch(() => null),
    m.getChat().catch(() => null)
  ]);
  const chatId = m.chatId?.toString() || event.chatId?.toString() || '';
  return telegramEvent(m, kind, {
    chatId,
    chatName: chat?.title || [chat?.firstName, chat?.lastName].filter(Boolean).join(' ') || chatId,
    authorName: author?.title || [author?.firstName, author?.lastName].filter(Boolean).join(' ') || author?.username || m.senderId?.toString() || ''
  });
}

export async function startTelegram(ctx) {
  const apiId = Number(ctx.config.apiId || await ctx.ask('Telegram application API ID (my.telegram.org): '));
  const apiHash = ctx.config.apiHash || await ctx.ask('Telegram application API hash: ', true);
  if (!Number.isInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) throw new Error('Invalid Telegram application credentials.');
  ctx.save({ apiId, apiHash });
  const session = new StringSession(ctx.queue.get('telegram-session') || '');
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, autoReconnect: true });
  client.setLogLevel('none');
  let timer;
  const stop = async () => { clearInterval(timer); await client.disconnect(); };
  ctx.onStop?.(stop);
  ctx.signal?.addEventListener('abort', () => { stop().catch(() => {}); }, { once: true });
  let processingFailed = false;
  const receive = async (event, kind) => {
    try {
      const normalized = await normalizeTelegramDelivery(event, kind);
      if (normalized) { ctx.capture(normalized); processingFailed = false; }
    } catch { processingFailed = true; ctx.health('error', 'Could not normalize a Telegram event; check companion version'); }
  };
  client.addEventHandler(e => receive(e, 'create'), new NewMessage({}));
  client.addEventHandler(e => receive(e, 'edit'), new EditedMessage({}));
  client.addEventHandler(e => {
    const channel = e.peer?.channelId?.toString();
    const scope = channel ? `channel:${channel}` : 'account';
    for (const id of e.deletedIds) ctx.capture({ eventId: eventId('telegram', scope, id, 'delete'), kind: 'delete', scope, externalId: String(id), occurredAt: new Date().toISOString() });
  }, new DeletedMessage({}));
  // A connect that never settles (flood wait, dead data centre) must surface as
  // a failure so the supervisor can retry with backoff instead of waiting forever.
  const connectWithTimeout = () => new Promise((resolve, reject) => {
    const limit = setTimeout(() => reject(new Error('Telegram did not answer within five minutes.')), 5 * 60_000);
    client.connect().then(resolve, reject).finally(() => clearTimeout(limit));
  });
  if (ctx.hosted && ctx.showQR) {
    await connectWithTimeout();
    const savedSession = !!ctx.queue.get('telegram-session');
    if (savedSession && !await client.checkAuthorization()) {
      // Telegram unregistered the stored key (the device was terminated from the
      // phone, or Telegram revoked it). Reusing it can never succeed; drop it
      // and ask the owner for a fresh scan instead of retrying forever.
      ctx.queue.delete('telegram-session');
      await client.disconnect().catch(() => {});
      throw Object.assign(new Error('Telegram signed this device out. Choose Try again to link it again.'), { relink: true });
    }
    if (!await client.checkAuthorization()) await client.signInUserWithQrCode({ apiId, apiHash }, {
      qrCode: ({ token, expires }) => { ctx.showQR(`tg://login?token=${token.toString('base64url')}`, expires * 1000); ctx.health('waiting', 'Scan this code in Telegram → Devices'); },
      password: () => ctx.ask('Telegram two-step verification password', true),
      abortSignal: ctx.signal,
      onError: () => { ctx.health('waiting', 'Check your Telegram password and try again.'); return false; }
    });
  } else await client.start({ phoneNumber: () => ctx.ask('Telegram phone number (include country code): '), phoneCode: () => ctx.ask('Telegram confirmation code: ', true),
    password: () => ctx.ask('Telegram 2FA password: ', true), emailAddress: () => ctx.ask('Telegram verification email: '),
    emailVerification: async () => ({ code: await ctx.ask('Telegram email code: ', true) }),
    onError: error => { console.error('Telegram sign-in:', error.errorMessage || error.name); } });
  ctx.queue.set('telegram-session', client.session.save());
  ctx.health('connected', 'Telegram account connected');
  timer = setInterval(() => {
    if (processingFailed) ctx.health('error', 'Could not normalize a Telegram event; check companion version');
    else ctx.health(client.connected ? 'connected' : 'reconnecting', client.connected ? 'Telegram account connected' : 'Reconnecting to Telegram');
  }, 15_000);
  return async () => { clearInterval(timer); ctx.queue.set('telegram-session', client.session.save()); await client.disconnect(); };
}
