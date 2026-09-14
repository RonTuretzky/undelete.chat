// Disappearing and view-once messages are excluded by design. Their deletions
// must be excluded too, or the archive shows a content-less tombstone for a
// message it never kept. The collector remembers which message ids it skipped
// (identifiers only, no content) for long enough to match a later deletion.
const prefix = 'ephemeral:';
const retentionMs = 45 * 86400_000;
export function createEphemeralMemory(queue, { now = Date.now } = {}) {
  queue.prunePrefix?.(prefix, now() - retentionMs);
  const key = event => `${prefix}${event.scope}:${event.externalId}`;
  return {
    // Returns the event to store, or null when it must be skipped.
    filter(event) {
      if (event.kind !== 'delete' && event.ephemeral) { queue.set(key(event), 1); return null; }
      if (event.kind === 'delete' && queue.get(key(event))) return null;
      return event.ephemeral ? null : event;
    },
    count() { return queue.countPrefix?.(prefix) ?? 0; },
  };
}
