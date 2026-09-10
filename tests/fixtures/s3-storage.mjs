import { createServer } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// An HTTP fixture, not a provider compatibility claim. Store encrypted request
// bodies on disk so SDK streaming tests do not hide buffering behind a mock.
export async function startS3Fixture() {
  const root = await mkdtemp(join(tmpdir(), 'afterword-s3-http-')), objects = new Map();
  const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const server = createServer(async (request, response) => {
    try {
      if (!request.headers.authorization?.startsWith('AWS4-HMAC-SHA256 ')) throw new Error('A signed SDK request is required.');
      const url = new URL(request.url, 'http://localhost');
      const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean), bucket = parts.shift(), key = parts.join('/');
      if (!bucket) throw new Error('Missing bucket.');
      if (request.method === 'GET' && url.searchParams.has('list-type')) {
        response.setHeader('Content-Type', 'application/xml');
        const found = [...objects].filter(([name]) => name.startsWith(url.searchParams.get('prefix') || ''));
        response.end('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>' + found.map(([name, object]) => '<Contents><Key>' + xml(name) + '</Key><LastModified>' + object.modified.toISOString() + '</LastModified><Size>' + object.size + '</Size></Contents>').join('') + '</ListBucketResult>');
        return;
      }
      if (request.method === 'PUT') {
        if (request.headers['x-amz-acl'] !== 'private' || !request.headers['content-length'] || request.headers['content-encoding']?.includes('aws-chunked')) throw new Error('Unexpected upload framing or permissions.');
        const path = join(root, randomUUID());
        await pipeline(request, createWriteStream(path, { mode: 0o600, flags: 'wx' }));
        objects.set(key, { path, size: (await stat(path)).size, sha256: request.headers['x-amz-meta-sha256'], modified: new Date() });
        response.setHeader('ETag', '"fixture-etag"'); response.end(); return;
      }
      const object = objects.get(key);
      if (!object) { response.writeHead(404, { 'Content-Type': 'application/xml' }); response.end('<Error><Code>NoSuchKey</Code></Error>'); return; }
      response.setHeader('Content-Length', object.size); response.setHeader('x-amz-meta-sha256', object.sha256);
      if (request.method === 'HEAD') response.end();
      else if (request.method === 'GET') await pipeline(createReadStream(object.path), response);
      else throw new Error('Unsupported fixture request.');
    } catch (e) {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/xml' });
      response.end('<Error><Code>FixtureFailure</Code><Message>' + xml(e.message) + '</Message></Error>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: 'http://127.0.0.1:' + server.address().port, objects,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); } };
}
