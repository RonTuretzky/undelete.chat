import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('extension service worker links, observes only the selected tab, uploads history, and stops on account change', async t => {
  // A mock of Chrome's extension APIs exercises the shipped worker. This test
  // does not launch/control a browser or touch a real Discord account.
  const store = createStore(':memory:', randomBytes(32).toString('hex')); t.after(() => store.close());
  const user = await store.createUser('worker-test', 'long-testing-password');
  const source = store.createConnection(user.id, 'discord', 'My personal account');
  const pairing = store.createPairing(source.id, user.id);
  const server = createApp(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;
  const event = () => ({ handlers: [], addListener(fn) { this.handlers.push(fn); }, emit(...args) { this.handlers.forEach(fn => fn(...args)); } });
  const calls = [], local = {}, intervals = [], realInterval = globalThis.setInterval;
  const chrome = {
    alarms: { create: async () => {}, onAlarm: event() },
    storage: { local: { get: async k => ({ [k]: local[k] }), set: async patch => Object.assign(local, patch), remove: async k => delete local[k] } },
    debugger: { attach: async target => calls.push(['attach', target]), detach: async target => calls.push(['detach', target]), sendCommand: async (target, command) => calls.push([command, target]), onEvent: event(), onDetach: event() },
    tabs: { get: async id => ({ id, url: 'https://discord.com/channels/@me' }), reload: async id => calls.push(['reload', id]), query: async () => [{ id: 7, title: 'Discord' }], onUpdated: event() },
    permissions: { contains: async () => true },
    runtime: { id: 'test', getURL: path => 'chrome-extension://test/' + path, onMessage: event() }
  };
  globalThis.chrome = chrome; globalThis.indexedDB = new IDBFactory();
  globalThis.setInterval = (fn, delay) => { const handle = realInterval(fn, delay); intervals.push(handle); return handle; };
  await import('../discord-extension/background.mjs'); globalThis.setInterval = realInterval;
  t.after(() => { intervals.forEach(clearInterval); delete globalThis.chrome; delete globalThis.indexedDB; });
  const send = (action, data = {}) => new Promise(resolve => chrome.runtime.onMessage.emit({ action, ...data }, { id: 'test', url: 'chrome-extension://test/popup.html' }, resolve));
  const frame = (type, data, tabId = 7, sessionId) => chrome.debugger.onEvent.emit({ tabId, ...(sessionId ? { sessionId } : {}) }, 'Network.webSocketFrameReceived', { requestId: 'socket', response: { opcode: 1, payloadData: JSON.stringify({ op: 0, t: type, d: data }) } });
  assert.equal((await send('pair', { server: serverUrl, code: pairing.code })).ok, true);
  assert.equal((await send('start', { tabId: 7 })).ok, true);
  chrome.debugger.onEvent.emit({ tabId: 7 }, 'Target.attachedToTarget', { sessionId: 'worker', targetInfo: { type: 'worker' } });
  chrome.debugger.onEvent.emit({ tabId: 7, sessionId: 'worker' }, 'Network.webSocketCreated', { requestId: 'socket', url: 'wss://gateway.discord.gg/?encoding=json' });
  frame('READY', { user: { id: '10', username: 'Owner' }, private_channels: [{ id: '20', type: 1, recipients: [{ id: '30', username: 'Friend' }] }], token: 'DO-NOT-COLLECT' }, 7, 'worker');
  const message = { id: '40', channel_id: '20', author: { id: '30', username: 'Friend' }, content: 'Before', timestamp: new Date().toISOString() };
  frame('MESSAGE_CREATE', message, 8, 'worker'); // Another tab is never observed.
  chrome.debugger.onEvent.emit({ tabId: 7, sessionId: 'worker' }, 'Network.webSocketFrameSent', { requestId: 'socket', response: { opcode: 1, payloadData: 'DO-NOT-COLLECT' } });
  frame('MESSAGE_CREATE', message, 7, 'worker');
  frame('MESSAGE_UPDATE', { ...message, content: 'After', edited_timestamp: new Date(Date.now() + 1).toISOString() }, 7, 'worker');
  frame('MESSAGE_DELETE', { id: '40', channel_id: '20' }, 7, 'worker');
  let status = (await send('status')).data;
  assert.equal(status.health, 'connected'); assert.equal(status.captured, 3);
  assert.equal('token' in status, false);
  frame('READY', { user: { id: '999', username: 'Another account' }, private_channels: [] }, 7, 'worker');
  status = (await send('status')).data;
  assert.equal(status.active, false); assert.equal(status.health, 'error'); assert.match(status.detail, /different Discord account/);
  assert.equal(status.queued, 0); // Failure path still flushes the earlier events.
  const [archived] = store.messages(user.id); assert.equal(archived.status, 'deleted'); assert.equal(archived.versionCount, 2);
  assert.deepEqual(archived.versions.map(v => v.text).filter(Boolean), ['Before', 'After']);
  assert.ok(calls.some(([name, target]) => name === 'Network.enable' && target.sessionId === 'worker'));
  assert.ok(calls.every(([name]) => ['attach', 'detach', 'reload', 'Network.enable', 'Target.setAutoAttach'].includes(name)));
});
