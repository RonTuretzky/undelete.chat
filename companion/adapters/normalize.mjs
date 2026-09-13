import { eventId, timestamp } from '../queue.mjs';

export function telegramEvent(m, kind, meta = {}) {
  if (!m?.id) return null;
  const channel = m.peerId?.channelId?.toString();
  const occurredAt = timestamp(kind === 'edit' ? m.editDate || m.date : m.date);
  const text = m.message || '';
  const attachments = m.media ? [{ name: m.file?.name || (m.media.className === 'MessageMediaPhoto' ? 'Photo' : 'Attachment'), type: m.file?.mimeType || 'file' }] : [];
  return { eventId: eventId('telegram', channel || 'account', m.id, kind, occurredAt, text), kind, scope: channel ? `channel:${channel}` : 'account',
    externalId: String(m.id), chatId: meta.chatId || '', chatName: meta.chatName || '', authorId: m.senderId?.toString() || '', authorName: meta.authorName || '',
    text, occurredAt, ephemeral: !!(m.ttlPeriod || m.media?.ttlSeconds), attachments };
}

export function signalEvent(envelope, resolve = id => id, remember = () => {}) {
  const sent = envelope.syncMessage?.sentMessage;
  const edit = sent?.editMessage || envelope.editMessage;
  const data = edit?.dataMessage || sent || envelope.dataMessage;
  if (!data) return null;
  const author = envelope.sourceUuid || envelope.sourceNumber || envelope.source || 'unknown';
  const chatId = data.groupInfo?.groupId || sent?.destinationUuid || sent?.destinationNumber || sent?.destination || author;
  const kind = data.remoteDelete ? 'delete' : edit ? 'edit' : 'create';
  if (kind === 'create' && data.message == null && !data.attachments?.length) return null;
  const target = data.remoteDelete?.timestamp || edit?.targetSentTimestamp || data.timestamp || envelope.timestamp;
  const externalId = resolve(`${author}:${target}`);
  if (edit && data.timestamp) remember(`${author}:${data.timestamp}`, externalId);
  // The Signal server's receipt time is trustworthy; the sender's own timestamp
  // still identifies the message for edits and deletions.
  const occurredAt = timestamp(envelope.serverReceivedTimestamp || data.timestamp || envelope.timestamp);
  return { eventId: eventId('signal', externalId, kind, occurredAt, data.message), kind, externalId, scope: chatId,
    chatId, chatName: data.groupInfo?.name || (sent ? sent.destinationNumber || chatId : envelope.sourceName || chatId),
    authorId: author, authorName: sent ? 'You' : envelope.sourceName || envelope.sourceNumber || author,
    text: kind === 'delete' ? undefined : data.message || '', occurredAt,
    ephemeral: !!(data.expiresInSeconds || data.viewOnce),
    attachments: (data.attachments || []).map(a => ({ name: a.filename || 'Attachment', type: a.contentType || 'file', ...(typeof a.size === 'number' ? { size: a.size } : {}) })) };
}

export function whatsappEvent(message, kind = 'create', now = new Date().toISOString()) {
  const key = message.key;
  if (!key?.id || !key.remoteJid || key.remoteJid === 'status@broadcast') return null;
  let content = message.message;
  if (content?.protocolMessage || content?.reactionMessage || message.messageStubType && !content && kind !== 'delete') return null;
  const ephemeral = !!(content?.ephemeralMessage || content?.viewOnceMessage || content?.viewOnceMessageV2 || content?.viewOnceMessageV2Extension);
  if (ephemeral) return null;
  if (content?.editedMessage?.message) { content = content.editedMessage.message; kind = 'edit'; }
  if (content?.documentWithCaptionMessage?.message) content = content.documentWithCaptionMessage.message;
  const media = content?.imageMessage || content?.videoMessage || content?.audioMessage || content?.documentMessage || content?.stickerMessage;
  if (content?.extendedTextMessage?.contextInfo?.expiration || media?.contextInfo?.expiration) return null;
  const text = content?.conversation ?? content?.extendedTextMessage?.text ?? media?.caption;
  if (kind !== 'delete' && text === undefined && !media) return null;
  const occurredAt = kind === 'delete' ? now : message.messageTimestamp ? timestamp(message.messageTimestamp) : now;
  return { eventId: eventId('whatsapp', key.remoteJid, key.id, kind, kind === 'delete' ? 'deleted' : occurredAt, text), kind,
    scope: key.remoteJid, externalId: key.id, chatId: key.remoteJid, chatName: message.chatName || key.remoteJid,
    authorId: key.participant || key.remoteJid, authorName: key.fromMe ? 'You' : message.pushName || key.participant || key.remoteJid,
    text: kind === 'delete' ? undefined : text || '', occurredAt,
    attachments: media ? [{ name: media.fileName || (content.imageMessage ? 'Photo' : content.audioMessage ? 'Audio' : content.videoMessage ? 'Video' : 'Attachment'), type: media.mimetype || 'file' }] : [] };
}
