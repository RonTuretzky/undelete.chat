import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, open, lstat, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform, Writable } from 'node:stream';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { freeBytes, capacityError, MiB, positiveBytes } from './capacity.mjs';

const magic = Buffer.from('AWB1'), overhead = 32, maxFileBytes = 4 * 1024 ** 3, manifestLimit = MiB;
const snapshotPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const filePattern = /^(afterword\.sqlite|collectors\/[a-f0-9-]{36}\/queue\.sqlite)$/;

export function offsiteConfig(env = process.env) {
  const names = ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_ACCESS_KEY', 'BACKUP_S3_SECRET_KEY'];
  if (!names.some(name => env[name])) return null;
  if (names.some(name => typeof env[name] !== 'string' || !env[name] || /[\r\n]/.test(env[name]))) throw new Error('All BACKUP_S3 settings are required.');
  const endpoint = new URL(env.BACKUP_S3_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-z]+\d\.digitaloceanspaces\.com$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('BACKUP_S3_ENDPOINT must be a DigitalOcean Spaces regional HTTPS endpoint.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.BACKUP_S3_BUCKET)) throw new Error('Invalid backup bucket name.');
  return { endpoint: endpoint.origin, bucket: env.BACKUP_S3_BUCKET, prefix: 'afterword/v1/', credentials: { accessKeyId: env.BACKUP_S3_ACCESS_KEY, secretAccessKey: env.BACKUP_S3_SECRET_KEY } };
}

export function offsiteClient(config) {
  return new S3Client({ endpoint: config.endpoint, region: 'us-east-1', credentials: config.credentials,
    forcePathStyle: false, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5000, socketTimeout: 30000 } });
}

function backupKey(key) {
  if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('A valid archive key is required for offsite backups.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(key, 'hex'), Buffer.alloc(0), 'afterword-offsite-v1', 32));
}
function objectPrefix(config, snapshot, upload) {
  if (config.prefix !== 'afterword/v1/' || !snapshotPattern.test(snapshot) || !uuidPattern.test(upload)) throw new Error('Invalid backup identifier.');
  return `${config.prefix}${snapshot}/${upload}/`;
}
function validManifest(manifest) {
  if (manifest?.format !== 1 || manifest.keyIncluded !== false || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.files) || manifest.files.length > 4096 || new Set(manifest.files).size !== manifest.files.length || !manifest.files.includes('afterword.sqlite') || manifest.files.some(name => typeof name !== 'string' || !filePattern.test(name))) throw new Error('Invalid backup manifest.');
  return manifest;
}
async function regularFile(root, path) {
  let current = root;
  if (!(await lstat(current)).isDirectory()) throw new Error('Backup root must be a real directory.');
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    const entry = await lstat(current);
    if (i === parts.length - 1 ? !entry.isFile() : !entry.isDirectory()) throw new Error('Backup paths must not contain links or special files.');
    if (i === parts.length - 1) return entry;
  }
}
async function limitedJson(path, limit = manifestLimit) {
  if ((await lstat(path)).size > limit) throw new Error('Backup metadata exceeds its size limit.');
  return JSON.parse(await readFile(path, 'utf8'));
}
async function digestFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function encryptFile(source, destination, key, aad, signal) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  await writeFile(destination, Buffer.concat([magic, iv]), { mode: 0o600, flag: 'wx' });
  await pipeline(createReadStream(source), cipher, createWriteStream(destination, { flags: 'a' }), { signal });
  await appendFile(destination, cipher.getAuthTag());
  return { bytes: (await lstat(destination)).size, sha256: await digestFile(destination) };
}
async function decryptFile(source, destination, key, aad, signal) {
  const size = (await lstat(source)).size;
  if (size < overhead) throw new Error('Truncated encrypted backup.');
  const handle = await open(source, 'r'), header = Buffer.alloc(16), tag = Buffer.alloc(16);
  try { await handle.read(header, 0, 16, 0); await handle.read(tag, 0, 16, size - 16); } finally { await handle.close(); }
  if (!header.subarray(0, 4).equals(magic)) throw new Error('Unsupported encrypted backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4));
  decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(tag);
  // Plaintext stays inside a private staging directory until every GCM tag and
  // file hash has verified. A failed restore never publishes that directory.
  await pipeline(createReadStream(source, { start: 16, end: size - 17 }), decipher, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
}
async function verifyRemote(client, config, object, expected, signal) {
  const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: object }), { abortSignal: signal });
  const hash = createHash('sha256'); let bytes = 0;
  const sink = new Writable({ write(chunk, encoding, callback) {
    bytes += chunk.length; if (bytes > expected.bytes) return callback(new Error('Remote backup size mismatch.'));
    hash.update(chunk); callback();
  } });
  await pipeline(response.Body, sink, { signal });
  if (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new Error('Remote backup integrity check failed.');
}
async function uploadFile(client, config, source, object, key, scratch, signal) {
  const encrypted = join(scratch, randomUUID());
  try {
    const proof = await encryptFile(source, encrypted, key, object, signal);
    const body = createReadStream(encrypted);
    try {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: object, ACL: 'private', ContentType: 'application/octet-stream',
        ContentLength: proof.bytes, Metadata: { sha256: proof.sha256 }, Body: body }), { abortSignal: signal });
    } finally { body.destroy(); }
    await verifyRemote(client, config, object, proof, signal);
    return proof;
  } finally { await rm(encrypted, { force: true }); }
}

export async function replicateBackup(directory, { config, client, key, minimumFreeBytes = 64 * MiB, availableBytes = freeBytes, signal } = {}) {
  const root = resolve(directory), snapshot = basename(root), encryptionKey = backupKey(key);
  if (!snapshotPattern.test(snapshot)) throw new Error('Invalid local snapshot name.');
  await regularFile(root, 'manifest.json');
  const manifest = validManifest(await limitedJson(join(root, 'manifest.json')));
  const receiptFile = join(root, 'offsite-receipt.json');
  let receipt;
  try { receipt = await limitedJson(receiptFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (receipt?.endpoint === config.endpoint && receipt.bucket === config.bucket && receipt.snapshot === snapshot) {
    const object = objectPrefix(config, snapshot, receipt.upload) + 'manifest.enc';
    try {
      const remote = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: object }), { abortSignal: signal });
      if (remote.ContentLength === receipt.manifest.bytes && remote.Metadata?.sha256 === receipt.manifest.sha256) return receipt;
    } catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; }
  }
  const upload = randomUUID(), prefix = objectPrefix(config, snapshot, upload), scratch = await mkdtemp(join(root, '.upload-'));
  const files = [];
  try {
    for (const name of manifest.files) {
      const entry = await regularFile(root, name);
      if (entry.size > maxFileBytes) throw new Error('Backup database exceeds the 4 GiB offsite file limit.');
      if (availableBytes(root) < minimumFreeBytes + entry.size + overhead) throw capacityError('disk_capacity');
      const proof = await uploadFile(client, config, join(root, name), prefix + name + '.enc', encryptionKey, scratch, signal);
      if (proof.bytes !== entry.size + overhead) throw new Error('A snapshot file changed during backup upload.');
      files.push({ name, plaintextBytes: entry.size, ...proof });
    }
    const remoteManifest = { format: 1, snapshot, upload, manifest, files };
    const manifestFile = join(scratch, 'manifest.json');
    await writeFile(manifestFile, JSON.stringify(remoteManifest), { mode: 0o600, flag: 'wx' });
    if ((await lstat(manifestFile)).size + overhead > manifestLimit) throw new Error('Encrypted backup manifest exceeds its size limit.');
    // Publishing this object commits the snapshot only after every uploaded
    // database has been read back and verified. Retries use a fresh prefix.
    const manifestProof = await uploadFile(client, config, manifestFile, prefix + 'manifest.enc', encryptionKey, scratch, signal);
    receipt = { endpoint: config.endpoint, bucket: config.bucket, snapshot, upload, verifiedAt: new Date().toISOString(), files: files.length, manifest: manifestProof };
    const temporary = join(scratch, 'receipt.json');
    await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 }); await rename(temporary, receiptFile);
    return receipt;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

async function* objects(client, config, signal) {
  let continuation;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix, ContinuationToken: continuation }), { abortSignal: signal });
    for (const item of page.Contents || []) yield item;
    if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === continuation)) throw new Error('Invalid backup listing continuation.');
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
}
function ownedObject(config, name) {
  if (!name?.startsWith(config.prefix)) return false;
  const [snapshot, upload, ...path] = name.slice(config.prefix.length).split('/');
  return snapshotPattern.test(snapshot) && uuidPattern.test(upload) && (path.join('/') === 'manifest.enc' || filePattern.test(path.join('/').replace(/\.enc$/, '')) && path.at(-1).endsWith('.enc'));
}
export async function listRemoteBackups({ config, client, signal }) {
  const result = [];
  for await (const item of objects(client, config, signal)) if (ownedObject(config, item.Key) && item.Key.endsWith('/manifest.enc')) {
    const [snapshot, upload] = item.Key.slice(config.prefix.length).split('/');
    result.push({ snapshot, upload, uploadedAt: item.LastModified?.toISOString() });
    if (result.length > 10000) throw new Error('Too many remote snapshots; inspect backup retention before listing again.');
  }
  return result.sort((a, b) => b.snapshot.localeCompare(a.snapshot));
}
export async function pruneRemoteBackups({ config, client, protectedReceipt, now = Date.now(), signal }) {
  const verifiedAt = Date.parse(protectedReceipt.verifiedAt);
  if (protectedReceipt.endpoint !== config.endpoint || protectedReceipt.bucket !== config.bucket || !Number.isFinite(verifiedAt) || verifiedAt > now + 60_000 || now - verifiedAt > 24 * 60 * 60_000) throw new Error('A recent verified backup is required before cleanup.');
  const protectedPrefix = objectPrefix(config, protectedReceipt.snapshot, protectedReceipt.upload);
  const cutoff = now - 7 * 24 * 60 * 60_000;
  let batch = [], deleted = 0;
  const remove = async () => {
    if (!batch.length) return;
    const result = await client.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: batch, Quiet: true } }), { abortSignal: signal });
    if (result.Errors?.length) throw new Error('Some expired backup objects could not be removed.');
    deleted += batch.length; batch = [];
  };
  for await (const item of objects(client, config, signal)) if (ownedObject(config, item.Key) && !item.Key.startsWith(protectedPrefix) && item.LastModified?.getTime() < cutoff) {
    batch.push({ Key: item.Key }); if (batch.length === 1000) await remove();
  }
  await remove(); return { deleted };
}

async function download(client, config, object, destination, maxBytes, signal, expected) {
  const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: object }), { abortSignal: signal });
  let bytes = 0; const hash = createHash('sha256');
  const limit = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length; if (bytes > maxBytes) return callback(new Error('Backup download exceeds its size limit.'));
    hash.update(chunk); callback(null, chunk);
  } });
  await pipeline(response.Body, limit, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
  const sha256 = hash.digest('hex');
  if (expected && (bytes !== expected.bytes || sha256 !== expected.sha256)) throw new Error('Downloaded backup integrity check failed.');
}
export async function restoreRemoteBackup({ config, client, key, snapshot, upload, destination, minimumFreeBytes = 64 * MiB, availableBytes = freeBytes, signal }) {
  const prefix = objectPrefix(config, snapshot, upload), encryptionKey = backupKey(key), target = resolve(destination);
  try { await lstat(target); throw new Error('Restore destination already exists.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(join(dirname(target), '.afterword-restore-')), data = join(scratch, 'data'), encrypted = join(scratch, 'encrypted');
  await mkdir(data, { mode: 0o700 });
  try {
    await download(client, config, prefix + 'manifest.enc', encrypted, manifestLimit, signal);
    const manifestFile = join(data, 'manifest.json');
    await decryptFile(encrypted, manifestFile, encryptionKey, prefix + 'manifest.enc', signal); await rm(encrypted);
    const remote = await limitedJson(manifestFile);
    const manifest = validManifest(remote.manifest);
    if (remote.format !== 1 || remote.snapshot !== snapshot || remote.upload !== upload || !Array.isArray(remote.files) || remote.files.length !== manifest.files.length || remote.files.some((entry, i) => entry.name !== manifest.files[i] || !Number.isSafeInteger(entry.plaintextBytes) || entry.plaintextBytes < 1 || entry.plaintextBytes > maxFileBytes || entry.bytes !== entry.plaintextBytes + overhead || !/^[a-f0-9]{64}$/.test(entry.sha256))) throw new Error('Invalid encrypted manifest.');
    for (const file of remote.files) {
      if (availableBytes(scratch) < minimumFreeBytes + file.bytes + file.plaintextBytes) throw capacityError('disk_capacity');
      const object = prefix + file.name + '.enc', output = join(data, file.name);
      await mkdir(dirname(output), { recursive: true, mode: 0o700 });
      await download(client, config, object, encrypted, file.bytes, signal, file);
      await decryptFile(encrypted, output, encryptionKey, object, signal); await rm(encrypted);
    }
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    // Reserve the destination exclusively before moving the verified files.
    await mkdir(target, { mode: 0o700 });
    try {
      for (const name of ['manifest.json', 'afterword.sqlite', ...(manifest.files.length > 1 ? ['collectors'] : [])]) await rename(join(data, name), join(target, name));
    } catch (e) { await rm(target, { recursive: true, force: true }); throw e; }
    return { directory: target, ...manifest };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const config = offsiteConfig(); if (!config) throw new Error('Offsite backup storage is not configured.');
    const client = offsiteClient(config), signal = AbortSignal.timeout(15 * 60_000), key = process.env.ARCHIVE_KEY;
    try {
      const [command, first, second, third] = process.argv.slice(2);
      const minimumFreeBytes = positiveBytes(process.env.ARCHIVE_MIN_FREE_BYTES, 64 * MiB, 'ARCHIVE_MIN_FREE_BYTES');
      let result;
      if (command === 'list') result = await listRemoteBackups({ config, client, signal });
      else if (command === 'upload' && first) result = await replicateBackup(first, { config, client, key, signal, minimumFreeBytes });
      else if (command === 'restore' && first && second && third) result = await restoreRemoteBackup({ config, client, key, signal, minimumFreeBytes, snapshot: first, upload: second, destination: third });
      else throw new Error('Usage: offsite.mjs list | upload SNAPSHOT_DIRECTORY | restore SNAPSHOT UPLOAD NEW_DIRECTORY');
      console.log(JSON.stringify(result));
    } finally { client.destroy(); }
  } catch (e) { console.error(e.name === 'Error' && !e.$metadata ? e.message : 'Offsite operation failed. Check storage permissions and connectivity.'); process.exitCode = 1; }
}
