import { generateKeys, wrap, unwrap, importPrivate, rememberKey, recallKey, forgetKey, createDecryptor, passwordIterations, recoveryIterations } from './vault.mjs';

// Orchestrates the account's archive key on this device: creating it at first
// sign-in, unlocking it with the password, rewrapping it when the password or
// recovery key changes, and opening sealed records for display.
export async function loadVaultSession(api, user) {
  const record = (await api('/vault')).vault;
  const key = await recallKey(user.id);
  if (key) return ready(user, key, record);
  return { status: record.state === 'none' ? 'setup' : 'locked', record, userId: user.id };
}
function ready(user, key, record) {
  const decrypt = createDecryptor(key, user.id);
  const openSummary = async m => {
    if (!m.sealed) return m;
    const [latest, meta] = await Promise.all([decrypt(m.id, m.latest), decrypt(m.id, m.meta)]);
    const names = latest?.authorName || latest?.chatName ? latest : meta;
    return { ...m, authorName: names?.authorName || 'Unknown sender', authorId: names?.authorId || '', chatName: names?.chatName || names?.chatId || 'Unknown conversation', externalId: names?.externalId || meta?.externalId || '', text: latest?.text ?? '', attachments: latest?.attachments || [], disappearingText: undefined };
  };
  const openVersion = async (messageId, v) => v?.sealed ? { ...v, ...(await decrypt(messageId, v.sealed)), sealed: undefined } : v;
  return {
    status: 'ready', record, userId: user.id, key,
    async decryptPage(data) { return { ...data, messages: await Promise.all((data.messages || []).map(openSummary)) }; },
    async decryptHistory(result) {
      const id = result.message.id;
      const versions = await Promise.all(result.message.versions.map(v => openVersion(id, v)));
      const previousVersion = await openVersion(id, result.history.previousVersion);
      return { ...result, message: { ...(await openSummary(result.message)), versions }, history: { ...result.history, previousVersion } };
    },
    async decryptExport(json) {
      return { ...json, sealed: undefined, messages: await Promise.all((json.messages || []).map(async m => ({ ...(await openSummary(m)), sealed: undefined, latest: undefined, meta: undefined, versions: await Promise.all((m.versions || []).map(v => openVersion(m.id, v))) }))) };
    },
    filterLocal(messages, query) {
      const q = query.trim().toLowerCase();
      if (!q) return messages;
      return messages.filter(m => `${m.authorName} ${m.chatName} ${m.text}`.toLowerCase().includes(q));
    },
  };
}
export async function setupVault(api, user, password, recoveryKey) {
  const keys = await generateKeys();
  const wrapped = { password: await wrap(keys.privatePkcs8, password, passwordIterations), recovery: await wrap(keys.privatePkcs8, recoveryKey, recoveryIterations) };
  const record = (await api('/vault/setup', { method: 'POST', body: { publicKey: keys.publicKey, wrapped } })).vault;
  const key = await importPrivate(keys.privatePkcs8); await rememberKey(user.id, key);
  return ready(user, key, record);
}
export async function unlockVault(api, user, password, record) {
  let pkcs8;
  try { pkcs8 = await unwrap(record.wrapped.password, password); } catch { throw new Error('That password does not unlock this archive.'); }
  const key = await importPrivate(pkcs8); await rememberKey(user.id, key);
  return ready(user, key, record);
}
// Password change: the old password unwraps the key, the new one wraps it again.
export async function rewrapForPassword(api, record, oldPassword, newPassword) {
  const pkcs8 = await unwrap(record.wrapped.password, oldPassword);
  const wrapped = { ...record.wrapped, password: await wrap(pkcs8, newPassword, passwordIterations) };
  return (await api('/vault/rewrap', { method: 'POST', body: { wrapped } })).vault;
}
export async function rewrapForRecoveryKey(api, record, password, newRecoveryKey) {
  const pkcs8 = await unwrap(record.wrapped.password, password);
  const wrapped = { ...record.wrapped, recovery: await wrap(pkcs8, newRecoveryKey, recoveryIterations) };
  return (await api('/vault/rewrap', { method: 'POST', body: { wrapped } })).vault;
}
// Account recovery: the old recovery key unwraps the key before the server rotates it.
export async function recoverVault(api, user, record, oldRecoveryKey, newPassword, newRecoveryKey) {
  if (!record || record.state === 'none') return setupVault(api, user, newPassword, newRecoveryKey);
  let pkcs8;
  try { pkcs8 = await unwrap(record.wrapped.recovery, oldRecoveryKey); } catch { throw new Error('The recovery key did not unlock the archive key. The password was reset, but the archive stays locked until the right key is used.'); }
  const wrapped = { password: await wrap(pkcs8, newPassword, passwordIterations), recovery: await wrap(pkcs8, newRecoveryKey, recoveryIterations) };
  const updated = (await api('/vault/rewrap', { method: 'POST', body: { wrapped } })).vault;
  const key = await importPrivate(pkcs8); await rememberKey(user.id, key);
  return ready(user, key, updated);
}
export const clearVault = userId => forgetKey(userId);
