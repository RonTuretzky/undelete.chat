import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { NewMessage, EditedMessage, DeletedMessage } from 'teleproto/events/index.js';
import { telegramEvent } from './normalize.mjs';
import { eventId } from '../queue.mjs';
export async function startTelegram(ctx) {
  const apiId = Number(ctx.config.apiId || await ctx.ask('Telegram application API ID (my.telegram.org): '));
  const apiHash = ctx.config.apiHash || await ctx.ask('Telegram application API hash: ', true);
  if (!Number.isInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) throw new Error('Invalid Telegram application credentials.');
  ctx.save({ apiId, apiHash });
  const session = new StringSession(ctx.queue.get('telegram-session') || '');
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5, autoReconnect: true });
  client.setLogLevel('none');
  const receive = async (event, kind) => {
    try {
      const m = event.message;
      if (!m || m.action) return;
      const author = await event.getSender().catch(() => null);
      const chat = await event.getChat().catch(() => null);
      const normalized = telegramEvent(m, kind, { chatId: event.chatId?.toString() || '',
        chatName: chat?.title || [chat?.firstName, chat?.lastName].filter(Boolean).join(' ') || event.chatId?.toString() || '',
        authorName: author?.title || [author?.firstName, author?.lastName].filter(Boolean).join(' ') || author?.username || m.senderId?.toString() || '' });
      if (normalized) ctx.capture(normalized);
    } catch { ctx.health('error', 'Could not normalize a Telegram event; check companion version'); }
  };
  client.addEventHandler(e => receive(e, 'create'), new NewMessage({}));
  client.addEventHandler(e => receive(e, 'edit'), new EditedMessage({}));
  client.addEventHandler(e => {
    const channel = e.peer?.channelId?.toString();
    const scope = channel ? `channel:${channel}` : 'account';
    for (const id of e.deletedIds) ctx.capture({ eventId: eventId('telegram', scope, id, 'delete'), kind: 'delete', scope, externalId: String(id), occurredAt: new Date().toISOString() });
  }, new DeletedMessage({}));
  await client.start({ phoneNumber: () => ctx.ask('Telegram phone number (include country code): '), phoneCode: () => ctx.ask('Telegram confirmation code: ', true),
    password: () => ctx.ask('Telegram 2FA password: ', true), emailAddress: () => ctx.ask('Telegram verification email: '),
    emailVerification: async () => ({ code: await ctx.ask('Telegram email code: ', true) }),
    onError: error => { console.error('Telegram sign-in:', error.errorMessage || error.name); } });
  ctx.queue.set('telegram-session', client.session.save());
  ctx.health('connected', 'Telegram account connected');
  const timer = setInterval(() => ctx.health(client.connected ? 'connected' : 'reconnecting', client.connected ? 'Telegram account connected' : 'Reconnecting to Telegram'), 15_000);
  return async () => { clearInterval(timer); ctx.queue.set('telegram-session', client.session.save()); await client.disconnect(); };
}
