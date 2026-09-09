import makeWASocket, { useMultiFileAuthState, DisconnectReason, WAMessageStubType } from '@whiskeysockets/baileys';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import pino from 'pino';
import qr from 'qrcode-terminal';
import { whatsappEvent } from './normalize.mjs';

export async function startWhatsApp(ctx) {
  const directory = join(ctx.directory, 'whatsapp-session');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(directory);
  let socket, stopped = false, retry, retryCount = 0;
  const receive = (message, kind) => {
    const jid = message.key?.remoteJid;
    if (ctx.queue.get(`wa-expiring:${jid}`)) return;
    const event = whatsappEvent({ ...message, chatName: ctx.queue.get(`wa-chat:${jid}`) }, kind);
    if (event) ctx.capture(event);
  };
  const connect = () => {
    socket = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false, shouldSyncHistoryMessage: () => false });
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', update => {
      if (update.qr) { console.log('Scan in WhatsApp → Settings → Linked devices:'); qr.generate(update.qr, { small: true }); ctx.health('waiting', 'Scan the QR code in your companion terminal'); }
      if (update.connection === 'open') { retryCount = 0; ctx.health('connected', 'WhatsApp linked device connected'); }
      if (update.connection === 'close' && !stopped) {
        const loggedOut = update.lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
        ctx.health(loggedOut ? 'error' : 'reconnecting', loggedOut ? 'WhatsApp unlinked this device. Relink from companion setup.' : 'Reconnecting to WhatsApp');
        if (!loggedOut) retry = setTimeout(connect, Math.min(60_000, 2000 * 2 ** retryCount++));
      }
    });
    // Offline deliveries can arrive as append; history sync is disabled separately.
    socket.ev.on('messages.upsert', ({ messages }) => { for (const message of messages) receive(message, 'create'); });
    socket.ev.on('messages.update', updates => { for (const { key, update } of updates) {
      if (update.messageStubType === WAMessageStubType.REVOKE) receive({ ...update, key }, 'delete');
      else if (update.message?.editedMessage) receive({ ...update, key }, 'edit');
    } });
    socket.ev.on('messages.delete', data => { if (data.keys) for (const key of data.keys) receive({ key }, 'delete'); });
    const chats = rows => { for (const row of rows) { if (row.name || row.subject) ctx.queue.set(`wa-chat:${row.id}`, row.name || row.subject); if (row.ephemeralExpiration !== undefined) ctx.queue.set(`wa-expiring:${row.id}`, !!row.ephemeralExpiration); } };
    socket.ev.on('chats.upsert', chats); socket.ev.on('chats.update', chats);
    socket.ev.on('groups.update', rows => { for (const row of rows) if (row.subject) ctx.queue.set(`wa-chat:${row.id}`, row.subject); });
  };
  connect();
  return () => { stopped = true; clearTimeout(retry); socket?.end(undefined); };
}
