# Archive reads and resource bounds

Message pages use SQLite filters and a 50-row limit before decrypting selected previews. Counts come from non-content metadata (`status`, `version_count`, and `edit_count`), updated in the same transaction as each new event. Duplicate delivery does not increment counts. Delete status takes precedence even when an earlier create or edit arrives later.

Existing archives gain these fields through a transactional migration. Backfill reads event kind metadata without decrypting or rewriting message payloads. Page, platform, status, connection, and history indexes support reads without loading the full archive into JavaScript.

## Search

Search still matches case-insensitive substrings in sender names, conversation names, and every received revision, including text subsequently edited or deleted. No plaintext search index is created. Candidates are scanned in small batches by immutable message ID, yielding between batches. Only matching IDs enter an ephemeral SQLite selection, whose page cache is limited to 2 MB. Completion, errors, and cancellation remove the selection.

This bounds application memory but search remains linear in the candidate archive. Filter by platform or status to reduce the work. API searches stop after 30 seconds with a retryable error. New searches cancel obsolete browser requests, and automatic refresh waits for an active request to finish.

## Exports

Exports retain the existing JSON format, including every stored version. The server selects message IDs and streams message previews and batches of revisions with network backpressure. It does not assemble the complete JSON document or every revision of a heavily edited message in memory. Closing the download releases its temporary selection and request slot.

The service allows four archive list/history/export requests globally, at most two per account. At most two exports run globally and one per account, leaving capacity for page requests. An export can keep running while it makes network progress; a connection idle for 60 seconds is cancelled. Capacity rejections return HTTP 429 with `Retry-After: 2`.

Capture continues while reads run. Search results can reflect changes made during the request. Exports select the message set at the start and freeze a revision boundary for each message as it is reached, keeping its preview and versions consistent. They are not a transactionally consistent full-database snapshot. Use the online backup procedure for recovery snapshots. Items deleted before their turn are skipped; deleting a message already being streamed interrupts the download so a truncated history is not reported as complete. Connection or decryption failures also interrupt the download.

## Individual message history

`GET /api/messages/:id?offset=0&snapshot=<sequence>` returns `message` and `history` for the signed-in owner. Each page contains at most 30 events, selected newest first in SQL and returned in chronological order. `history` includes the event total, captured version count, offset, page size, snapshot boundary, latest sequence, older/newer flags, and at most one preceding non-deletion version for comparisons. Version numbers retain their place in the full captured history.

The first request establishes the sequence boundary. Paging reuses it so late or new events cannot shift the reader's pages. Background checks update the message summary and signal new activity; Refresh history starts a new snapshot. Deleting the archive item invalidates subsequent reads. These pages share the archive request limits, cancellation, and 30-second read timeout.

The browser renders only the selected page and compares its revisions with the preceding version when necessary. This preserves every adjacent comparison across page boundaries. Word highlighting has time, edit-distance, and text-size limits; if those are exceeded, the full before and after texts remain visible. Exports continue to include all stored versions.

## Verification

`tests/archive-reading.test.mjs` checks migration without ciphertext changes, account isolation, paging around an intentionally corrupt unrequested message, index selection, out-of-order/deleted history, duplicate delivery, historical substring matching, metadata fallbacks, cancellation cleanup, HTTP validation, concurrency limits, exported content equivalence, and edits/deletions during a streamed download.

`tests/history.test.mjs` checks all events and adjacent comparisons across pages, stable boundaries with late arrivals, global version numbers, delete-only pages, same-time ordering, bounded decryption, cancellation, owner-only HTTP access, cursor validation, and large-diff fallback. `tests/fixtures/history-preview.mjs` provides a disposable loopback-only workspace for browser checks, with synthetic incoming edits and one-shot request failures.

Run the disposable large-archive benchmark explicitly:

```sh
node --max-old-space-size=64 tests/fixtures/archive-scale.mjs
```

Local measurement on September 10, 2026 after adding capacity accounting: 12,001 synthetic messages and 26,000 versions, including one message with 2,000 revisions of 40,000 characters each; page 10 ms, historical search 1,052 ms, newest and oldest history pages together 6 ms, streaming export 2,316 ms for 160 MB. Sampled peak JavaScript heap was 29.5 MB and process RSS 171.5 MB. The fixture explicitly raises its account allowance to 1 GiB. This is one local measurement under a 64 MB heap limit, not a production throughput or concurrency guarantee.

## Storage allowances and delivery recovery

The default archive allowance is 128 MiB per account, with a separate 1 GiB server-wide archive budget. Production also reserves 2 GiB of free disk space. Operators can configure these bounds; see [operations](OPERATIONS.md). They are pilot safety limits, not paid-plan definitions or a guarantee of the disk space needed by SQLite and backups.

An event is charged its encrypted payload bytes, twice its UTF-8 event identifier length, and 768 bytes for associated records. A message is charged 1,536 bytes; a deletion marker is charged 512 bytes. These fixed charges bound metadata growth as well as content. They are allowance accounting, not exact filesystem measurements. Markers prevent erased history from reappearing and remain charged until account deletion.

SQLite insert/delete triggers maintain account and global usage in the same transaction as the data. Admission checks run inside `BEGIN IMMEDIATE`, so separate writer processes cannot reserve the same remaining space. Duplicates, paused events, excluded ephemeral events, and retries of forgotten items do not add usage. Migration derives sizes from ciphertext and metadata without decrypting or rewriting content; over-limit archives remain readable and exportable.

Capacity failures are retryable. A hosted source is stopped and disabled until the owner resumes it; encrypted queued copies and saved login state remain. Supervisor restart does not silently restart a source stopped for capacity. Invalid payloads are quarantined, while transient internal/storage failures remain pending. The API never exposes internal database error text. Companion and extension deliveries honor the same retryable distinction.

Each companion/hosted queue allows 32 MiB for events, including rejected events, and a separate 32 MiB for encrypted metadata. A full queue refuses growth rather than evicting earlier copies; acknowledgements and smaller replacements release capacity. Signal snapshots are bounded at 16 MiB before base64/encryption overhead. Queue requests are split below the HTTP body limit. Queue capacity failures stop collection and require operator attention; activity during a stop can be missed.

Production archive writes, hosted queue growth, and backups check the same available-disk reserve. Before copying each database, a backup reserves its current page count plus the configured free-space margin; a failed attempt removes its partial copy and retains previous complete backups. Relinking refuses to erase a queue containing pending or quarantined events, including an event arriving during worker shutdown. External disk/backup alerts and concurrent production load measurements remain outstanding.
