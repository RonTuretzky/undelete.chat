import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';

// Persist every credential/key mutation through the encrypted per-source vault.
// Baileys BufferJSON preserves binary keys across serialization and restarts.
export function encryptedWhatsAppAuth(queue) {
  const storageKey = file => 'wa-auth:file:' + file.replace(/\//g, '__').replace(/:/g, '-') + '.json';
  const read = key => {
    const value = queue.get(storageKey(key));
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value), BufferJSON.reviver);
  };
  const write = (key, value) => value == null ? queue.delete(storageKey(key)) : queue.set(storageKey(key), JSON.parse(JSON.stringify(value, BufferJSON.replacer)));
  const creds = read('creds') || initAuthCreds();
  return {
    state: { creds, keys: {
      async get(type, ids) {
        const values = {};
        for (const id of ids) {
          let value = read(`${type}-${id}`);
          if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          values[id] = value;
        }
        return values;
      },
      async set(data) { for (const [type, values] of Object.entries(data)) for (const [id, value] of Object.entries(values)) write(`${type}-${id}`, value); }
    } },
    saveCreds: () => write('creds', creds)
  };
}
