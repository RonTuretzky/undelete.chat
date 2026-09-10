import { gatewayDecoder, gatewayOptions, discordPage, PersonalDiscord } from './core.mjs';
import { openVault, archiveOrigin, archiveRequest } from './storage.mjs';

let vault, config, tabId = null, model, chain = Promise.resolve(), flushing = false, queuedPackets = 0;
let health = 'waiting', detail = 'Pair with your Afterword archive to begin.', lastTraffic = 0, captured = 0, uploadError = '';
let epoch = 0, serverPaused = false;
const streams = new Map();
const serial = fn => { const result = chain.then(fn); chain = result.catch(() => {}); return result; };
const boot = (async () => {
  vault = await openVault(); config = await vault.get('config');
  const old = await chrome.storage.local.get('activeTabId');
  if (Number.isInteger(old.activeTabId)) await chrome.debugger.detach({ tabId: old.activeTabId }).catch(() => {});
  await chrome.storage.local.remove('activeTabId');
  if (config) detail = 'Paired. Choose your Discord tab and start capture.';
  await chrome.alarms.create('afterword-sync', { periodInMinutes: 0.5 });
  await chrome.alarms.create('afterword-prune', { periodInMinutes: 60 });
})();
async function state() {
  const identity = await vault.get('identity');
  return { paired: !!config, server: config?.server, name: config?.name, identity: identity?.name, active: tabId !== null, paused: serverPaused, health, detail, uploadError, captured, queued: await vault.count(), rejected: await vault.rejected() };
}
async function stop(reason = 'Capture stopped. Your queued events will still upload.') {
  const previous = tabId; tabId = null; epoch++; streams.clear(); model = null;
  health = 'waiting'; detail = reason;
  await chrome.storage.local.remove('activeTabId');
  if (previous !== null) await chrome.debugger.detach({ tabId: previous }).catch(() => {});
}
async function fail(message) { await stop(message); health = 'error'; await sync(); }
async function enable(target) {
  await chrome.debugger.sendCommand(target, 'Network.enable');
  await chrome.debugger.sendCommand(target, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'worker', exclude: false }, { type: 'iframe', exclude: false }] });
}
async function start(selected) {
  if (!config) throw new Error('Pair with your archive first.');
  if (!Number.isInteger(selected)) throw new Error('Choose an open Discord tab.');
  const tab = await chrome.tabs.get(selected);
  if (!discordPage(tab.url)) throw new Error('Capture is restricted to a Discord Web tab.');
  if (!await chrome.permissions.contains({ origins: [config.server + '/*'] })) throw new Error('Archive permission was removed. Pair again.');
  await stop();
  await chrome.debugger.attach({ tabId: selected }, '1.3');
  tabId = selected; captured = 0; lastTraffic = Date.now(); health = 'waiting'; detail = 'Waiting for Discord sign-in. The tab will reload once.';
  await chrome.storage.local.set({ activeTabId: tabId });
  model = new PersonalDiscord(vault, async event => { await vault.add(event); captured++; }, async () => { health = 'connected'; detail = 'Personal Discord DMs and group DMs are being observed.'; });
  try { await enable({ tabId }); await chrome.tabs.reload(tabId); }
  catch { await stop(); throw new Error('Could not observe this Discord tab. Close its DevTools and try Start again.'); }
}
async function sync() {
  await boot;
  if (!config || flushing) return;
  flushing = true;
  const destination = config;
  try {
    if (tabId !== null && Date.now() - lastTraffic > 90000) { health = 'reconnecting'; detail = 'Discord traffic stopped. Check the tab and internet connection.'; }
    const rejected = await vault.rejected();
    const hb = await archiveRequest(destination, '/api/heartbeat', { health: rejected ? 'error' : health, detail: rejected ? 'An event was rejected. Update the extension; its encrypted copy remains queued.' : detail, queued: await vault.count() });
    serverPaused = !!hb.paused;
    // The server acknowledges paused deliveries as ignored, matching the archive's
    // documented discard-on-pause semantics. They must not replay after Resume.
    {
      for (let i = 0; i < 4; i++) {
        const events = await vault.pending(); if (!events.length) break;
        const result = await archiveRequest(destination, '/api/ingest', { events });
        await vault.acknowledge(result.results, events);
        const retry = result.results?.find(r => r.error && r.retryable);
        if (retry) {
          if (['archive_quota', 'server_capacity', 'disk_capacity'].includes(retry.code)) { await stop(retry.error); health = 'error'; }
          throw new Error(retry.error);
        }
      }
    }
    uploadError = '';
  } catch (error) {
    uploadError = error.message;
    if (error.revoked) { await stop(error.message); health = 'error'; }
  } finally { flushing = false; }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId !== tabId || tabId === null) return;
  // Deliberately ignore HTTP request/response bodies, request headers, and all
  // outgoing WebSocket frames (including Discord login/Identify credentials).
  if (!['Target.attachedToTarget', 'Network.webSocketCreated', 'Network.webSocketFrameReceived', 'Network.webSocketClosed', 'Network.webSocketFrameError'].includes(method)) return;
  const session = source.sessionId || 'main', socketKey = `${session}:${params.requestId}`;
  if (method === 'Target.attachedToTarget') {
    if (!['worker', 'iframe'].includes(params.targetInfo?.type)) return;
    const child = { tabId, sessionId: params.sessionId };
    enable(child).catch(() => serial(() => fail('A Discord worker could not be observed. Restart capture.')));
    return;
  }
  if (method === 'Network.webSocketCreated') {
    const options = gatewayOptions(params.url); if (!options) return;
    try {
      const ownerEpoch = epoch;
      streams.set(socketKey, gatewayDecoder(options, packet => {
        if (packet?.op !== 0 || !['READY', 'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'MESSAGE_DELETE_BULK'].includes(packet.t)) return;
        if (++queuedPackets > 500) { queuedPackets--; serial(() => fail('Capture could not keep up. Restart after checking archive access.')); return; }
        serial(async () => {
          try { if (epoch === ownerEpoch && model && !(serverPaused && packet?.t?.startsWith('MESSAGE_'))) await model.packet(packet); }
          catch (error) { await fail(error.message); }
          finally { queuedPackets--; }
        });
      }));
    } catch (error) { serial(() => fail(error.message)); }
    return;
  }
  const decoder = streams.get(socketKey); if (!decoder) return;
  if (method === 'Network.webSocketClosed' || method === 'Network.webSocketFrameError') {
    // Retain no wire data after a socket closes. Reconnect uses a new decoder.
    const closedEpoch = epoch; streams.delete(socketKey);
    serial(() => { if (epoch === closedEpoch && !streams.size) { health = 'reconnecting'; detail = 'Discord is reconnecting; capture may have a gap.'; } }); return;
  }
  try { lastTraffic = Date.now(); decoder(params.response); if (model?.ready && health === 'reconnecting') { health = 'connected'; detail = 'Personal Discord session resumed.'; } }
  catch (error) { serial(() => fail(error.message)); }
});
chrome.debugger.onDetach.addListener(source => { if (source.tabId === tabId) serial(() => stop('Capture stopped because the tab closed or debugging was canceled. Click Start to resume.')); });
chrome.tabs.onUpdated.addListener((id, change) => { if (id === tabId && change.url && !discordPage(change.url)) serial(() => stop('Capture stopped because this tab left Discord.')); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'afterword-prune') boot.then(() => serial(() => vault.prune())).catch(() => {});
  if (alarm.name === 'afterword-sync') sync().catch(() => {});
});
setInterval(() => sync().catch(() => {}), 5000);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  boot.then(() => serial(async () => {
    if (message.action === 'status') return state();
    if (message.action === 'tabs') return (await chrome.tabs.query({ url: ['https://discord.com/*', 'https://ptb.discord.com/*', 'https://canary.discord.com/*'] })).map(t => ({ id: t.id, title: t.title || 'Discord' }));
    if (message.action === 'pair') {
      if (flushing) throw new Error('Archive sync is finishing. Try pairing again in a moment.');
      if (config) throw new Error('Disconnect this archive before pairing another.');
      const server = archiveOrigin(message.server);
      if (!await chrome.permissions.contains({ origins: [server + '/*'] })) throw new Error('Allow access to your Afterword server first.');
      const result = await archiveRequest({ server }, '/api/pair', { code: String(message.code || '').trim(), platform: 'discord' });
      const c = result.connection;
      if (c?.platform !== 'discord' || !/^aw_[\w-]{43}$/.test(c.token) || typeof c.connectionId !== 'string') throw new Error('Use the pairing code from a Discord connection.');
      config = { server, token: c.token, connectionId: c.connectionId, name: c.name || 'My Discord' };
      await vault.set('config', config); serverPaused = false; detail = 'Paired. Select your Discord tab to start.';
    } else if (message.action === 'start') await start(message.tabId);
    else if (message.action === 'stop') await stop();
    else if (message.action === 'disconnect') {
      if (flushing) throw new Error('Archive sync is finishing. Try disconnecting again in a moment.');
      if (await vault.count()) throw new Error('Upload the queued events before disconnecting. Use Stop if you only want to pause capture.');
      await stop('Disconnected. Pair an archive to begin again.'); config = null; serverPaused = false; await vault.clear();
    } else throw new Error('Unknown extension action.');
    return state();
  })).then(data => reply({ ok: true, data })).catch(error => reply({ ok: false, error: error.message }));
  return true;
});
