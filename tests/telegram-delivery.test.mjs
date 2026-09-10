import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'teleproto';
import { NewMessageEvent } from 'teleproto/events/NewMessage.js';
import { EditedMessageEvent } from 'teleproto/events/EditedMessage.js';
import { installMessageBehaviour } from 'teleproto/tl/custom/message.js';
import { normalizeTelegramDelivery } from '../companion/adapters/telegram.mjs';

// TelegramClient installs these Message helpers before receiving live updates.
installMessageBehaviour();

function message() {
  const m = new Api.Message({ id: 42, peerId: new Api.PeerUser({ userId: 123n }), fromId: new Api.PeerUser({ userId: 456n }), date: 1789000000, message: 'Connection check' });
  m._sender = new Api.User({ id: 456n, firstName: 'Test', lastName: 'Sender' });
  m._chat = new Api.User({ id: 123n, firstName: 'Saved', lastName: 'Messages' });
  return m;
}
test('actual teleproto message events resolve sender metadata through Message', async () => {
  const m = message(), event = new NewMessageEvent(m, {});
  assert.equal(typeof event.getSender, 'undefined', 'SDK event does not offer the Message sender helper');
  const captured = await normalizeTelegramDelivery(event, 'create');
  assert.equal(captured.text, 'Connection check');
  assert.equal(captured.authorName, 'Test Sender');
  assert.equal(captured.chatName, 'Saved Messages');
  assert.equal(captured.chatId, '123');
  assert.equal(captured.externalId, '42');
});
test('actual edited SDK messages preserve content when optional entity lookup fails', async () => {
  const m = message();
  m.message = 'Updated connection check'; m.editDate = m.date + 60;
  m.getSender = async () => { throw new Error('Entity unavailable'); };
  m.getChat = async () => { throw new Error('Entity unavailable'); };
  const captured = await normalizeTelegramDelivery(new EditedMessageEvent(m, {}), 'edit');
  assert.equal(captured.text, 'Updated connection check');
  assert.equal(captured.kind, 'edit');
  assert.equal(captured.chatId, '123');
  assert.equal(captured.chatName, '123');
  assert.equal(captured.occurredAt, new Date((m.date + 60) * 1000).toISOString());
});
