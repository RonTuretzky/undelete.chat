const id = value => typeof value === 'string' && /^\d{1,24}$/.test(value);
const label = value => typeof value === 'string' ? value.slice(0, 500) : '';
export class AccountChanged extends Error {}
export class PersonalDiscord {
  constructor(store, capture, onReady = () => {}) { this.store = store; this.capture = capture; this.onReady = onReady; this.ready = false; }
  async channel(c, users = new Map()) {
    if (!id(c?.id) || c.guild_id || ![1, 3].includes(c.type)) return;
    const recipients = (c.recipients || c.recipient_ids || []).map(r => typeof r === 'string' ? users.get(r) : r).filter(Boolean);
    const name = label(c.name) || recipients.map(r => label(r.global_name || r.username)).filter(Boolean).join(', ').slice(0, 500) || (c.type === 3 ? 'Group DM' : 'Direct message');
    await this.store.set(`channel:${c.id}`, { name, type: c.type });
  }
  async packet(p) {
    if (p?.op !== 0 || !p.d || typeof p.t !== 'string') return;
    const d = p.d;
    if (p.t === 'READY') {
      if (!id(d.user?.id)) throw new Error('Discord did not identify the signed-in account.');
      const prior = await this.store.get('identity');
      if (prior && prior.id !== d.user.id) throw new AccountChanged('A different Discord account signed in. Pair a separate Undelete source for that account.');
      // Clear stale channel membership on a new session, while preserving binding.
      await this.store.clearPrefix('channel:');
      await this.store.set('identity', { id: d.user.id, name: label(d.user.global_name || d.user.username) });
      const users = new Map((d.users || []).filter(u => id(u.id)).map(u => [u.id, { username: u.username, global_name: u.global_name }]));
      for (const c of d.private_channels || []) await this.channel(c, users);
      this.ready = true; await this.onReady(); return;
    }
    if (!this.ready) return;
    if (p.t === 'CHANNEL_CREATE' || p.t === 'CHANNEL_UPDATE') return this.channel(d);
    // Closing a DM does not invalidate a previously identified personal channel.
    if (!['MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'MESSAGE_DELETE_BULK'].includes(p.t) || d.guild_id || !id(d.channel_id)) return;
    const channel = await this.store.get(`channel:${d.channel_id}`);
    if (!channel) return; // Never infer DM membership from a missing guild_id.
    if (p.t === 'MESSAGE_DELETE_BULK') { for (const messageId of d.ids || []) await this.message({ id: messageId, channel_id: d.channel_id }, 'delete', channel); return; }
    await this.message(d, p.t === 'MESSAGE_CREATE' ? 'create' : p.t === 'MESSAGE_UPDATE' ? 'edit' : 'delete', channel);
  }
  async message(d, kind, channel) {
    if (!id(d.id) || (d.flags & 64)) return; // Ephemeral interactions are excluded.
    const key = `message:${d.channel_id}:${d.id}`, prior = await this.store.get(key);
    if (kind === 'edit' && d.content === undefined && d.attachments === undefined) return;
    if (kind !== 'delete' && d.content === undefined && d.attachments === undefined) return;
    const text = d.content === undefined ? prior?.text : String(d.content).slice(0, 100_000);
    const attachments = d.attachments === undefined ? prior?.attachments || [] : d.attachments.slice(0, 50).map(a => ({ name: label(a.filename) || 'Attachment', type: label(a.content_type).slice(0, 100) || 'file', ...(Number.isFinite(a.size) && a.size >= 0 ? { size: a.size } : {}) }));
    const suppliedTime = kind === 'edit' ? d.edited_timestamp : d.timestamp;
    const occurredAt = kind === 'delete' || !suppliedTime || !Number.isFinite(Date.parse(suppliedTime)) ? new Date().toISOString() : new Date(suppliedTime).toISOString();
    const authorId = id(d.author?.id) ? d.author.id : prior?.authorId || '';
    const authorName = label(d.author?.global_name || d.author?.username) || prior?.authorName || '';
    const fingerprint = JSON.stringify([d.channel_id, d.id, kind, kind === 'delete' ? null : suppliedTime || null, kind === 'delete' ? null : text, kind === 'delete' ? null : attachments]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    const eventId = 'discord-browser-' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const event = { eventId, kind, externalId: d.id, scope: d.channel_id, chatId: d.channel_id, chatName: channel.name, authorId, authorName, occurredAt, attachments: kind === 'delete' ? [] : attachments };
    if (kind !== 'delete') event.text = text || '';
    await this.capture(event);
    if (kind !== 'delete') await this.store.set(key, { text, attachments, authorId, authorName, updated: Date.now() });
    else await this.store.delete(key);
  }
}
