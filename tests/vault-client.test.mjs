import test from 'node:test';
import assert from 'node:assert/strict';
import { sealTo, openSealed } from '../server/vault.mjs';
import { generateKeys, wrap, unwrap, importPrivate, open, isSealed, passwordIterations, recoveryIterations } from '../web/vault.mjs';

// The browser module runs under Node's WebCrypto here, proving both sides of
// the envelope agree byte for byte.
test('a key made in the browser opens what the server sealed, and the wrapped key survives password and recovery unwrapping', async () => {
  const keys = await generateKeys();
  const sealed = sealTo(keys.publicKey, { text: 'from the platform', authorName: 'Alice', attachments: [] }, 'user:message:event');
  assert.ok(isSealed(sealed));
  const privateKey = await importPrivate(keys.privatePkcs8);
  assert.deepEqual(await open(privateKey, sealed, 'user:message:event'), { text: 'from the platform', authorName: 'Alice', attachments: [] });
  await assert.rejects(open(privateKey, sealed, 'user:message:other'), 'context is authenticated');
  const byPassword = await wrap(keys.privatePkcs8, 'correct horse battery', passwordIterations), byRecovery = await wrap(keys.privatePkcs8, 'awr_' + 'k'.repeat(43), recoveryIterations);
  assert.equal(byPassword.iterations, 600_000); assert.notEqual(byPassword.ciphertext, byRecovery.ciphertext);
  assert.deepEqual(await unwrap(byPassword, 'correct horse battery'), keys.privatePkcs8);
  assert.deepEqual(await unwrap(byRecovery, 'awr_' + 'k'.repeat(43)), keys.privatePkcs8);
  await assert.rejects(unwrap(byPassword, 'wrong password'));
  assert.equal(JSON.stringify(byPassword).includes(Buffer.from(keys.privatePkcs8).toString('base64')), false, 'the wrapped blob does not contain the raw key');
  // A Node-generated envelope opened by the browser module, and the reverse direction through the server helper.
  const nodeOpened = openSealed(Buffer.from(`-----BEGIN PRIVATE KEY-----\n${Buffer.from(keys.privatePkcs8).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`), sealed, 'user:message:event');
  assert.equal(nodeOpened.text, 'from the platform');
});
