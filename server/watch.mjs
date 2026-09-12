import { z } from 'zod';

// Per-platform watch windows, in hours. The delete window is how long a message
// stays in the watch buffer, because a deletion can only be caught while its
// content is still on hand. The edit window is how long edits to a held message
// are still recorded. Defaults are each platform's own limit plus a margin.
export const platformLimits = {
  whatsapp: { delete: '2 days', edit: '15 minutes' },
  signal: { delete: '24 hours', edit: '24 hours' },
  telegram: { delete: 'any time', edit: '48 hours' },
};
export const defaultWatch = {
  whatsapp: { editHours: 1, deleteHours: 72 },
  signal: { editHours: 48, deleteHours: 48 },
  telegram: { editHours: 72, deleteHours: 720 },
};
export const editChoices = [1, 6, 24, 48, 72, 168];
export const deleteChoices = [24, 48, 72, 168, 720];
const hours = choices => z.union(choices.map(h => z.literal(h)));
export const watchSchema = z.object(Object.fromEntries(Object.keys(defaultWatch).map(platform => [platform,
  z.object({ editHours: hours(editChoices), deleteHours: hours(deleteChoices) }).partial().optional()]))).strict();

export function resolveWatch(stored) {
  let parsed = {};
  if (typeof stored === 'string' && stored) { try { parsed = JSON.parse(stored); } catch { parsed = {}; } }
  else if (stored && typeof stored === 'object') parsed = stored;
  const result = {};
  for (const [platform, defaults] of Object.entries(defaultWatch)) {
    const custom = parsed?.[platform] || {};
    result[platform] = {
      editHours: editChoices.includes(custom.editHours) ? custom.editHours : defaults.editHours,
      deleteHours: deleteChoices.includes(custom.deleteHours) ? custom.deleteHours : defaults.deleteHours,
    };
  }
  return result;
}
export function mergeWatch(stored, patch) {
  const current = resolveWatch(stored), next = {};
  for (const platform of Object.keys(defaultWatch)) next[platform] = { ...current[platform], ...(patch[platform] || {}) };
  return next;
}
