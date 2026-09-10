import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, symlink, stat, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createStore } from '../server/store.mjs';
import { openQueue } from '../companion/queue.mjs';
import { createBackup } from '../server/backup.mjs';
import { replicateBackup, restoreRemoteBackup, listRemoteBackups, pruneRemoteBackups, offsiteConfig, offsiteClient } from '../server/offsite.mjs';
import { createBackupService, clearBackupStaging } from '../server/backup-service.mjs';
import { startS3Fixture } from './fixtures/s3-storage.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const config = { endpoint: 'https://nyc3.digitaloceanspaces.com', bucket: 'afterword-test-backups', prefix: 'afterword/v1/' };
class Storage {
  data = new Map(); calls = []; failUpload = 0; corruptRead = false;
  async send(command) {
    const { Key, Body, Metadata } = command.input, name = command.constructor.name;
    this.calls.push({ name, key: Key });
    if (name === 'PutObjectCommand') {
      if (this.failUpload && --this.failUpload === 0) throw new Error('Simulated storage failure with private provider details');
      const chunks = []; for await (const chunk of Body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, command.input.ContentLength); assert.equal(command.input.ACL, 'private');
      this.data.set(Key, { bytes, metadata: Metadata, modified: new Date() }); return {};
    }
    if (name === 'GetObjectCommand' || name === 'HeadObjectCommand') {
      const object = this.data.get(Key);
      if (!object) throw Object.assign(new Error('Missing'), { $metadata: { httpStatusCode: 404 } });
      const bytes = Buffer.from(object.bytes); if (this.corruptRead) bytes[20] ^= 1;
      return { Body: Readable.from((function* () { for (let i = 0; i < bytes.length; i += 8192) yield bytes.subarray(i, i + 8192); })()), ContentLength: bytes.length, Metadata: object.metadata };
    }
    if (name === 'ListObjectsV2Command') {
      const entries = [...this.data].filter(([key]) => key.startsWith(command.input.Prefix));
      const offset = Number(command.input.ContinuationToken || 0), page = entries.slice(offset, offset + 2);
      return { Contents: page.map(([Key, object]) => ({ Key, LastModified: object.modified })), IsTruncated: offset + 2 < entries.length, NextContinuationToken: String(offset + 2) };
    }
    if (name === 'DeleteObjectsCommand') { for (const { Key } of command.input.Delete.Objects) this.data.delete(Key); return {}; }
    throw new Error('Unexpected storage operation: ' + name);
  }
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'afterword-offsite-')), key = randomBytes(32).toString('hex');
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createStore(join(root, 'afterword.sqlite'), key), user = await store.createUser('owner', 'long-test-password');
  const connection = store.createConnection(user.id, 'telegram', 'Cloud'), source = store.connectionByToken(connection.token);
  store.ingest(source, { eventId: 'one', kind: 'create', externalId: '1', scope: 'account', text: 'secret original message', occurredAt: new Date().toISOString() });
  store.ingest(source, { eventId: 'two', kind: 'edit', externalId: '1', scope: 'account', text: 'secret edited message', occurredAt: new Date().toISOString() });
  const derived = createHmac('sha256', Buffer.from(key, 'hex')).update('afterword-hosted:' + connection.id).digest('hex');
  const queue = openQueue(join(root, 'collectors', connection.id), derived); queue.set('telegram-session', 'secret linked session');
  const snapshot = await createBackup(root);
  queue.close(); store.close();
  return { root, key, user, connection, derived, snapshot, client: new Storage() };
}
test('offsite backups encrypt metadata, verify uploads, and restore archive and sessions offline', async t => {
  const f = await fixture(t), options = { config, client: f.client, key: f.key };
  const receipt = await replicateBackup(f.snapshot.directory, options);
  assert.equal(receipt.files, 2);
  for (const object of f.client.data.values()) for (const text of ['SQLite format', 'secret original', 'secret linked', f.key, 'telegram', 'createdAt']) assert.equal(object.bytes.includes(Buffer.from(text)), false);
  assert.match(f.client.calls.filter(c => c.name === 'PutObjectCommand').at(-1).key, /manifest.enc$/);
  const uploaded = f.client.calls.length;
  assert.deepEqual(await replicateBackup(f.snapshot.directory, options), receipt);
  assert.equal(f.client.calls.length, uploaded + 1);
  const list = await listRemoteBackups(options); assert.equal(list.length, 1);
  const destination = join(f.root, 'restored');
  const restored = await restoreRemoteBackup({ ...options, ...list[0], destination });
  assert.equal(restored.keyIncluded, false);
  for (const name of f.snapshot.files) assert.deepEqual(await readFile(join(destination, name)), await readFile(join(f.snapshot.directory, name)));
  const store = createStore(join(destination, 'afterword.sqlite'), f.key);
  const message = store.messages(f.user.id)[0]; assert.equal(message.text, 'secret edited message');
  assert.equal(store.message(message.id, f.user.id).versions.length, 2); store.close();
  const queue = openQueue(join(destination, 'collectors', f.connection.id), f.derived);
  assert.equal(queue.get('telegram-session'), 'secret linked session'); queue.close();
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
  await assert.rejects(restoreRemoteBackup({ ...options, ...list[0], destination }), /already exists/);
});
test('failed uploads never commit and retries preserve earlier verified remote copies', async t => {
  const f = await fixture(t), options = { config, client: f.client, key: f.key };
  f.client.failUpload = 2;
  await assert.rejects(replicateBackup(f.snapshot.directory, options), /Simulated storage failure/);
  assert.equal((await listRemoteBackups(options)).length, 0);
  assert.equal((await readdir(f.snapshot.directory)).some(name => name.startsWith('.upload-') || name === 'offsite-receipt.json'), false);
  f.client.failUpload = 0;
  const first = await replicateBackup(f.snapshot.directory, options);
  const original = new Map([...f.client.data].map(([key, value]) => [key, Buffer.from(value.bytes)]));
  await rm(join(f.snapshot.directory, 'offsite-receipt.json'));
  const second = await replicateBackup(f.snapshot.directory, options); assert.notEqual(first.upload, second.upload);
  for (const [key, bytes] of original) assert.deepEqual(f.client.data.get(key).bytes, bytes);
  assert.equal((await listRemoteBackups(options)).length, 2);
});
test('corrupt downloads and wrong keys leave no published restore or plaintext staging files', async t => {
  const f = await fixture(t), options = { config, client: f.client, key: f.key };
  const receipt = await replicateBackup(f.snapshot.directory, options), destination = join(f.root, 'restored');
  f.client.corruptRead = true;
  await assert.rejects(restoreRemoteBackup({ ...options, ...receipt, destination }));
  f.client.corruptRead = false;
  await assert.rejects(restoreRemoteBackup({ ...options, ...receipt, key: randomBytes(32).toString('hex'), destination }));
  const database = [...f.client.data.keys()].find(key => key.endsWith('afterword.sqlite.enc'));
  f.client.data.get(database).bytes[40] ^= 1;
  await assert.rejects(restoreRemoteBackup({ ...options, ...receipt, destination }), /integrity/);
  assert.equal((await readdir(f.root)).some(name => name === 'restored' || name.startsWith('.afterword-restore-')), false);
});
test('upload readback failures, path traversal, symlinks and disk pressure never publish a manifest', async t => {
  const f = await fixture(t), options = { config, client: f.client, key: f.key };
  f.client.corruptRead = true; await assert.rejects(replicateBackup(f.snapshot.directory, options), /integrity/);
  f.client.corruptRead = false;
  await assert.rejects(replicateBackup(f.snapshot.directory, { ...options, minimumFreeBytes: 100, availableBytes: () => 100 }), { code: 'disk_capacity' });
  const manifestPath = join(f.snapshot.directory, 'manifest.json'), original = await readFile(manifestPath);
  const manifest = JSON.parse(original); manifest.files.push('../../app.env');
  await writeFile(manifestPath, JSON.stringify(manifest)); await assert.rejects(replicateBackup(f.snapshot.directory, options), /Invalid backup manifest/);
  await writeFile(manifestPath, original);
  await rm(join(f.snapshot.directory, 'afterword.sqlite')); await symlink(join(f.root, 'afterword.sqlite'), join(f.snapshot.directory, 'afterword.sqlite'));
  await assert.rejects(replicateBackup(f.snapshot.directory, options), /links or special/);
  assert.equal((await listRemoteBackups(options)).length, 0);
});
test('seven-day cleanup removes only owned expired objects and protects the current verified snapshot', async t => {
  const f = await fixture(t), options = { config, client: f.client, key: f.key };
  const oldReceipt = await replicateBackup(f.snapshot.directory, options);
  const oldKeys = [...f.client.data.keys()];
  for (const object of f.client.data.values()) object.modified = new Date(Date.now() - 8 * 86400000);
  await rm(join(f.snapshot.directory, 'offsite-receipt.json'));
  const current = await replicateBackup(f.snapshot.directory, options);
  f.client.data.set(config.prefix + 'do-not-delete.txt', { bytes: Buffer.from('unrelated'), modified: new Date(0) });
  await assert.rejects(pruneRemoteBackups({ ...options, protectedReceipt: { ...oldReceipt, verifiedAt: new Date(0).toISOString() } }), /recent verified/);
  const result = await pruneRemoteBackups({ ...options, protectedReceipt: current });
  assert.equal(result.deleted, oldKeys.length);
  for (const key of oldKeys) assert.equal(f.client.data.has(key), false);
  assert.equal(f.client.data.has(config.prefix + 'do-not-delete.txt'), true);
  assert.equal((await listRemoteBackups(options)).length, 1);
});
test('backup service retries the same snapshot, serializes runs and reports failures without provider details', async t => {
  const root = await mkdtemp(join(tmpdir(), 'afterword-backup-service-')); t.after(() => rm(root, { recursive: true, force: true }));
  let time = Date.now(), snapshots = 0, uploads = 0, fail = true, cleanups = 0;
  const service = createBackupService(root, { key: 'test', config, client: {}, now: () => time, log: { info() {}, error() {} },
    snapshot: async () => { snapshots++; return { directory: 'test', createdAt: new Date(time).toISOString() }; },
    replicate: async () => { uploads++; if (fail) throw new Error('private access credential'); return { verifiedAt: new Date(time).toISOString(), snapshot: 'snapshot' }; },
    prune: async () => { cleanups++; }
  });
  const first = service.run(); assert.equal(service.run(), first); await first;
  let status = JSON.parse(await readFile(join(root, 'backup-status.json')));
  assert.equal(status.state, 'failed'); assert.equal(status.failure, 'offsite_failed'); assert.equal(JSON.stringify(status).includes('credential'), false);
  fail = false; time += 900000; await service.run(); assert.equal(snapshots, 1); assert.equal(uploads, 2); assert.equal(cleanups, 1);
  status = JSON.parse(await readFile(join(root, 'backup-status.json'))); assert.equal(status.state, 'complete'); assert.equal(status.failure, undefined);
  time += 86400000; await service.run(); assert.equal(snapshots, 2); await service.close(); await service.run(); assert.equal(uploads, 3);
});
test('offsite configuration is explicit and interrupted encrypted staging cleanup preserves snapshots', async t => {
  assert.equal(offsiteConfig({}), null);
  const env = { BACKUP_S3_ENDPOINT: config.endpoint, BACKUP_S3_BUCKET: config.bucket, BACKUP_S3_ACCESS_KEY: 'id', BACKUP_S3_SECRET_KEY: 'secret' };
  assert.deepEqual(offsiteConfig(env), { ...config, credentials: { accessKeyId: 'id', secretAccessKey: 'secret' } });
  assert.throws(() => offsiteConfig({ BACKUP_S3_BUCKET: 'test' }), /required/);
  for (const endpoint of ['http://nyc3.digitaloceanspaces.com', 'https://example.com', config.endpoint + '/path', 'https://user:pass@nyc3.digitaloceanspaces.com']) assert.throws(() => offsiteConfig({ ...env, BACKUP_S3_ENDPOINT: endpoint }));
  const f = await fixture(t), scratch = join(f.snapshot.directory, '.upload-123abc');
  await mkdir(scratch); await writeFile(join(scratch, 'partial'), 'ciphertext');
  await clearBackupStaging(f.root);
  assert.equal((await readdir(f.snapshot.directory)).includes(basename(scratch)), false);
  assert.ok((await stat(join(f.snapshot.directory, 'afterword.sqlite'))).size > 0);
});
test('changing backup storage clears previous destination success before reporting an upload failure', async t => {
  const root = await mkdtemp(join(tmpdir(), 'afterword-backup-target-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'backup-status.json'), JSON.stringify({ lastOffsiteAt: new Date().toISOString(), offsiteSnapshot: 'old', offsiteTarget: { endpoint: config.endpoint, bucket: 'old-bucket' } }));
  const service = createBackupService(root, { config, client: {}, key: 'test', log: { info() {}, error() {} },
    snapshot: async () => ({ directory: root, createdAt: new Date().toISOString() }), replicate: async () => { throw new Error('Storage unavailable'); } });
  const status = await service.run(); await service.close();
  assert.equal(status.state, 'failed'); assert.equal(status.lastOffsiteAt, undefined); assert.equal(status.offsiteSnapshot, undefined);
  assert.deepEqual(status.offsiteTarget, { endpoint: config.endpoint, bucket: config.bucket });
});
test('the real S3 SDK streams a large database through signed HTTP uploads, readback and offline restore', async t => {
  const f = await fixture(t), provider = await startS3Fixture(); t.after(() => provider.close());
  const settings = { ...config, endpoint: provider.endpoint, credentials: { accessKeyId: 'TESTACCESSKEY', secretAccessKey: 'fixture-secret-only' } };
  const client = offsiteClient(settings); t.after(() => client.destroy());
  const source = join(f.snapshot.directory, 'afterword.sqlite');
  const db = new DatabaseSync(source); db.exec('CREATE TABLE large_fixture (payload BLOB); INSERT INTO large_fixture VALUES (zeroblob(33554432));'); db.close();
  const options = { config: settings, client, key: f.key };
  const receipt = await replicateBackup(f.snapshot.directory, options);
  assert.deepEqual(await replicateBackup(f.snapshot.directory, options), receipt);
  const list = await listRemoteBackups(options); assert.equal(list.length, 1);
  const destination = join(f.root, 'http-restored');
  await restoreRemoteBackup({ ...options, ...receipt, destination });
  const hash = async path => { const h = createHash('sha256'); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest('hex'); };
  assert.equal(await hash(join(destination, 'afterword.sqlite')), await hash(source));
  const restored = new DatabaseSync(join(destination, 'afterword.sqlite'), { readOnly: true });
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); restored.close();
});
