import { statfsSync } from 'node:fs';
import { ZodError } from 'zod';

export const MiB = 1024 * 1024;
export const capacityMessages = {
  archive_quota: 'Capture stopped because an event did not fit. Delete archived messages or shorten retention in Settings, then resume from Connections.',
  server_capacity: 'Archive storage is temporarily full. Capture has stopped; please contact support before resuming.',
  disk_capacity: 'The server is low on disk space. Capture has stopped; please contact support before resuming.',
  collector_capacity: 'This connection’s encrypted queue is full. Capture has stopped to protect queued events. Please contact support.',
};
export const capacityError = (code, requiredBytes = 0) => Object.assign(new Error(capacityMessages[code]), {
  code, requiredBytes, capacity: true, retryable: true, public: true, status: 507,
});
export function positiveBytes(value, fallback, name) {
  const bytes = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`${name} must be a positive integer number of bytes.`);
  return bytes;
}
export function freeBytes(directory) {
  const disk = statfsSync(directory, { bigint: true });
  return Number(disk.bavail * disk.bsize);
}
export function deliveryFailure(error) {
  if (error?.capacity && capacityMessages[error.code]) return { error: capacityMessages[error.code], code: error.code, retryable: true };
  if (error?.code === 'subscription_required') return { error: error.message, code: error.code, retryable: true };
  if (error instanceof ZodError || error?.permanent) return { error: 'Invalid event payload.', code: 'invalid_event', retryable: false };
  // Storage failures and unknown internal errors must not quarantine otherwise
  // valid events. Keep them queued, without leaking database or message details.
  return { error: 'The archive could not save this event yet. It remains queued for retry.', code: 'archive_unavailable', retryable: true };
}
