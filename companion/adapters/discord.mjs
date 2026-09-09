import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { discordEvent } from './normalize.mjs';
export async function startDiscord(ctx) {
  const botToken = ctx.config.botToken || await ctx.ask('Discord bot token (stored on this computer): ', true);
  ctx.save({ botToken });
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: [Partials.Channel, Partials.Message] });
  const receive = (data, kind) => {
    const channel = client.channels.cache.get(data.channel_id);
    const guild = channel?.guild;
    const chatName = channel?.name ? `${guild?.name ? `${guild.name} · ` : ''}#${channel.name}` : 'Bot direct messages';
    // MESSAGE_UPDATE is partial. Merge only after deciding it actually carries content.
    if (kind === 'edit' && data.content === undefined && data.attachments === undefined) return;
    const metaKey = `discord:${data.id}`;
    const prior = ctx.queue.get(metaKey) || {};
    const merged = { ...prior, ...data, chatName, ...(kind === 'edit' && !data.edited_timestamp ? { edited_timestamp: new Date().toISOString() } : {}) };
    const event = discordEvent(merged, kind);
    if (event) ctx.capture(event);
    if (kind !== 'delete') ctx.queue.set(metaKey, { author: merged.author, content: merged.content, attachments: merged.attachments, timestamp: merged.timestamp });
  };
  client.on('raw', ({ t, d }) => {
    if (t === 'MESSAGE_CREATE') receive(d, 'create');
    if (t === 'MESSAGE_UPDATE') receive(d, 'edit');
    if (t === 'MESSAGE_DELETE') receive(d, 'delete');
    if (t === 'MESSAGE_DELETE_BULK') for (const id of d.ids) receive({ id, channel_id: d.channel_id }, 'delete');
  });
  client.on('clientReady', () => ctx.health('connected', 'Discord bot connected'));
  client.on('shardDisconnect', () => ctx.health('reconnecting', 'Discord connection interrupted'));
  client.on('shardReconnecting', () => ctx.health('reconnecting', 'Reconnecting to Discord'));
  client.on('shardResume', () => ctx.health('connected', 'Discord session resumed'));
  client.on('error', () => ctx.health('error', 'Discord connection error; check companion'));
  await client.login(botToken);
  return () => client.destroy();
}
