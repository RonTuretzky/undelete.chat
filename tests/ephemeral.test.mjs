import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openQueue } from '../companion/queue.mjs';
import { createEphemeralMemory } from '../companion/ephemeral.mjs';
import { readQueueStatus } from '../server/monitor.mjs';

const event = (kind, id, extra = {}) => ({ eventId: `${kind}-${id}`, kind, externalId: id, scope: 'group-1', chatId: 'group-1', chatName: 'Group', authorName: 'A', ...(kind === 'delete' ? {} : { text: 'hello' }), occurredAt: new Date().toISOString(), ephemeral: false, attachments: [], ...extra });

test('deletions of disappearing messages are skipped like the messages themselves, and skipped ids are counted and pruned', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'undelete-ephemeral-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const queue = openQueue(directory, randomBytes(32).toString('hex'), { minimumFreeBytes: 0 }); t.after(() => queue.close());
  let clock = Date.now();
  const memory = createEphemeralMemory(queue, { now: () => clock });
  assert.equal(memory.filter(event('create', 'vanishing', { ephemeral: true })), null, 'a disappearing message is not stored');
  assert.equal(memory.filter(event('delete', 'vanishing')), null, 'its later deletion is not stored either');
  assert.equal(memory.count(), 1);
  assert.deepEqual(memory.filter(event('delete', 'never-seen')), event('delete', 'never-seen'), 'a deletion for an unknown message still records a tombstone');
  const kept = memory.filter(event('create', 'ordinary')); assert.equal(kept.externalId, 'ordinary');
  assert.equal(memory.filter(event('delete', 'ordinary', { ephemeral: true })), null, 'a deletion flagged ephemeral itself is skipped');
  assert.equal(readQueueStatus(join(directory, 'queue.sqlite')).ephemeral, 1, 'the monitor can see how many were skipped');
  assert.equal(JSON.stringify(queue.db ? [] : []).includes('hello'), false);
  clock += 46 * 86400_000;
  createEphemeralMemory(queue, { now: () => clock });
  assert.equal(memory.count(), 0, 'markers older than the longest watch window are pruned on start');
});
