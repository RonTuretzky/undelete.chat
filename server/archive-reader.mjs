import { randomUUID } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';

const rank = "CASE kind WHEN 'create' THEN 0 WHEN 'edit' THEN 1 ELSE 2 END";
const eventOrder = `occurred_at, ${rank}, id`;
const pageSize = 50;

export function createArchiveReader(db, crypt) {
  // Temporary selections contain identifiers only. Their SQLite cache is
  // bounded; plaintext queries, names and message text are never indexed.
  db.exec(`PRAGMA temp_store=FILE; PRAGMA temp.cache_size=-2048;
    CREATE TEMP TABLE archive_selection (
      read_id TEXT NOT NULL, message_id TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY(read_id,message_id)
    );
    CREATE INDEX temp.archive_selection_order ON archive_selection(read_id,position);`);
  const open = (row, event) => ({ ...crypt.open(event.payload, `${row.user_id}:${row.id}:${event.event_uid}`), receivedAt: event.received_at, sequence: event.id });

  function snapshot(row) {
    const current = db.prepare('SELECT * FROM messages WHERE id=? AND user_id=?').get(row.id, row.user_id);
    if (!current) return null;
    const maxSequence = db.prepare('SELECT coalesce(max(id),0) AS n FROM events WHERE message_id=?').get(row.id).n;
    return { row: current, maxSequence };
  }

  function stats(userId) {
    return { ...db.prepare(`SELECT count(*) AS total, coalesce(sum(status='edited'),0) AS edited,
      coalesce(sum(edit_count),0) AS edits, coalesce(sum(status='deleted'),0) AS deleted,
      coalesce(sum(saved),0) AS saved, coalesce(sum(version_count),0) AS versions FROM messages WHERE user_id=?`).get(userId) };
  }

  async function* events(row, { signal, reverse = false, maxSequence, requirePresent = false } = {}) {
    maxSequence ??= db.prepare('SELECT coalesce(max(id),0) AS n FROM events WHERE message_id=?').get(row.id).n;
    const present = requirePresent ? db.prepare('SELECT 1 FROM messages WHERE id=? AND user_id=?') : null;
    const check = () => {
      signal?.throwIfAborted();
      if (present && !present.get(row.id, row.user_id)) throw Object.assign(new Error('The archive changed during this download. Export it again.'), { public: true, status: 503 });
    };
    let cursor;
    while (true) {
      check();
      const direction = reverse ? 'DESC' : 'ASC', comparison = reverse ? '<' : '>';
      const rows = db.prepare(`SELECT *, ${rank} AS kind_rank FROM events WHERE message_id=? AND id<=?
        ${cursor ? `AND (occurred_at,${rank},id) ${comparison} (?,?,?)` : ''}
        ORDER BY occurred_at ${direction}, ${rank} ${direction}, id ${direction} LIMIT 25`)
        .all(row.id, maxSequence, ...(cursor || []));
      if (!rows.length) return;
      for (const event of rows) { check(); yield open(row, event); }
      const last = rows.at(-1); cursor = [last.occurred_at, last.kind_rank, last.id];
      await yieldTurn();
    }
  }

  async function summary(row, options = {}) {
    options.signal?.throwIfAborted();
    const maxSequence = options.maxSequence ?? db.prepare('SELECT coalesce(max(id),0) AS n FROM events WHERE message_id=?').get(row.id).n;
    const lastEvent = db.prepare(`SELECT * FROM events WHERE message_id=? AND id<=? AND kind!='delete'
      ORDER BY occurred_at DESC, ${rank} DESC, id DESC LIMIT 1`).get(row.id, maxSequence);
    const last = lastEvent && open(row, lastEvent);
    let meta = last?.authorName || last?.chatName ? last : null;
    if (!meta) {
      for await (const event of events(row, { ...options, maxSequence, reverse: true })) {
        if (event.kind !== 'delete' && (event.authorName || event.chatName)) { meta = event; break; }
      }
      if (!meta) {
        const first = db.prepare(`SELECT * FROM events WHERE message_id=? AND id<=? ORDER BY ${eventOrder} LIMIT 1`).get(row.id, maxSequence);
        meta = first && open(row, first);
      }
    }
    return { id: row.id, platform: row.platform, connectionId: row.connection_id,
      firstSeen: row.first_seen, lastSeen: row.last_seen, saved: !!row.saved, status: row.status,
      authorName: meta?.authorName || 'Unknown sender', authorId: meta?.authorId || '',
      chatName: meta?.chatName || meta?.chatId || 'Unknown conversation', externalId: meta?.externalId || '',
      text: last?.text ?? '', attachments: last?.attachments || [],
      originalMissing: row.version_count === row.edit_count, versionCount: row.version_count };
  }

  function filters(userId, { platform, status, saved } = {}) {
    const clauses = ['m.user_id=?'], params = [userId];
    if (platform) { clauses.push('m.platform=?'); params.push(platform); }
    if (status) { clauses.push('m.status=?'); params.push(status); }
    if (saved) clauses.push('m.saved=1');
    return { where: clauses.join(' AND '), params };
  }

  async function matches(row, query, options) {
    const current = snapshot(row);
    if (!current) return false;
    options = { ...options, maxSequence: current.maxSequence };
    const preview = await summary(current.row, options);
    let tail = '';
    const feed = text => {
      const chunk = tail + text.toLowerCase();
      const found = chunk.includes(query);
      tail = query.length > 1 ? chunk.slice(-(query.length - 1)) : '';
      return found;
    };
    if (feed(`${preview.authorName} ${preview.chatName} `)) return true;
    let first = true;
    for await (const event of events(current.row, options)) {
      if (feed((first ? '' : ' ') + (event.text || ''))) return true;
      first = false;
    }
    return false;
  }

  async function listMessages(userId, options = {}) {
    const { signal } = options;
    signal?.throwIfAborted();
    const query = String(options.q || '').slice(0, 300).toLowerCase();
    const offset = Number.isSafeInteger(options.offset) && options.offset > 0 ? options.offset : 0;
    const { where, params } = filters(userId, options);
    const readId = query ? randomUUID() : null;
    try {
      if (query) {
        // Scan by immutable ID. New deliveries that change last_seen cannot
        // make a message disappear from the scan or appear twice.
        const cutoff = db.prepare('SELECT coalesce(max(rowid),0) AS n FROM messages WHERE user_id=?').get(userId).n;
        let cursor = '', position = 0;
        const select = db.prepare(`SELECT m.* FROM messages m WHERE ${where} AND m.id>? AND m.rowid<=? ORDER BY m.id LIMIT 25`);
        const insert = db.prepare('INSERT INTO archive_selection VALUES (?,?,?)');
        while (true) {
          signal?.throwIfAborted();
          const rows = select.all(...params, cursor, cutoff);
          if (!rows.length) break;
          for (const row of rows) {
            if (await matches(row, query, { signal })) insert.run(readId, row.id, position++);
          }
          cursor = rows.at(-1).id;
          await yieldTurn();
        }
      }
      signal?.throwIfAborted();
      const selection = readId ? 'AND m.id IN (SELECT message_id FROM archive_selection WHERE read_id=?)' : '';
      const values = [...params, ...(readId ? [readId] : [])];
      const total = db.prepare(`SELECT count(*) AS n FROM messages m WHERE ${where} ${selection}`).get(...values).n;
      const rows = db.prepare(`SELECT m.* FROM messages m WHERE ${where} ${selection} ORDER BY m.last_seen DESC,m.id LIMIT ? OFFSET ?`).all(...values, pageSize, offset);
      const messages = [];
      for (const row of rows) {
        const current = snapshot(row);
        if (current) messages.push(await summary(current.row, { signal, maxSequence: current.maxSequence }));
      }
      signal?.throwIfAborted();
      return { messages, total, stats: stats(userId) };
    } finally {
      if (readId) db.prepare('DELETE FROM archive_selection WHERE read_id=?').run(readId);
    }
  }

  async function* exportArchive(userId, { signal } = {}) {
    signal?.throwIfAborted();
    const readId = randomUUID();
    // Freeze the message order as IDs, without buffering content. Re-check
    // ownership when reading each batch so deleted accounts/items stay gone.
    db.prepare(`INSERT INTO archive_selection SELECT ?,id,row_number() OVER (ORDER BY last_seen DESC,id)
      FROM messages WHERE user_id=?`).run(readId, userId);
    try {
      yield `{"exportedAt":${JSON.stringify(new Date().toISOString())},"version":1,"messages":[`;
      let cursor = 0, firstMessage = true;
      while (true) {
        signal?.throwIfAborted();
        const rows = db.prepare(`SELECT m.*,s.position FROM archive_selection s JOIN messages m ON m.id=s.message_id
          WHERE s.read_id=? AND m.user_id=? AND s.position>? ORDER BY s.position LIMIT 25`).all(readId, userId, cursor);
        if (!rows.length) break;
        for (const row of rows) {
          signal?.throwIfAborted();
          const current = snapshot(row);
          if (!current) continue;
          const options = { signal, maxSequence: current.maxSequence, requirePresent: true };
          const preview = await summary(current.row, options);
          yield (firstMessage ? '' : ',') + JSON.stringify(preview).slice(0, -1) + ',"versions":[';
          let firstEvent = true;
          for await (const event of events(current.row, options)) {
            yield (firstEvent ? '' : ',') + JSON.stringify(event); firstEvent = false;
          }
          yield ']}'; firstMessage = false;
        }
        cursor = rows.at(-1).position;
        await yieldTurn();
      }
      signal?.throwIfAborted();
      yield ']}';
    } finally {
      db.prepare('DELETE FROM archive_selection WHERE read_id=?').run(readId);
    }
  }
  return { listMessages, messageStats: stats, exportArchive };
}
