import { diffWords } from 'diff';

export function demoHistory(message, offset = 0, requestedSnapshot) {
  let number = 0;
  const latestSequence = message.versions.length;
  const snapshot = requestedSnapshot ?? latestSequence;
  const all = message.versions.slice(0, snapshot).map((version, index) => ({
    ...version, sequence: version.sequence ?? index + 1,
    versionNumber: version.kind === 'delete' ? null : ++number,
  }));
  const pageSize = 30, end = Math.max(0, all.length - offset), start = Math.max(0, end - pageSize);
  const versions = all.slice(start, end);
  const previousVersion = versions.some(v => v.kind !== 'delete') ? all.slice(0, start).findLast(v => v.kind !== 'delete') || null : null;
  return { message: { ...message, versions }, history: {
    total: all.length, versionCount: number, offset, pageSize, snapshot, latestSequence,
    hasOlder: start > 0, hasNewer: offset > 0 && all.length > 0, previousVersion,
  } };
}

export function historyComparisons(versions, previousVersion) {
  const comparisons = [];
  let before = previousVersion;
  for (const after of versions) {
    if (after.kind === 'delete') continue;
    if (before) comparisons.push({ before, after });
    before = after;
  }
  return comparisons.reverse();
}

export function boundedDiff(before, after) {
  // Keep a page of large or unrelated messages from freezing the browser.
  // Both original strings remain available when a highlighted diff is costly.
  if (before === after) return [{ value: after, added: false, removed: false }];
  if (before.length + after.length > 100_000) return null;
  return diffWords(before, after, { maxEditLength: 500, timeout: 20 }) || null;
}
