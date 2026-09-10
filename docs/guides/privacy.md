# Your data, privacy, and retention

What Afterword stores and how to remove it.

<a id="storage"></a>

## Hosted sessions and message copies

Hosted collectors run on Afterword’s server. Platform login sessions, ordinary captured messages, and the revisions received by each collector are stored separately for each source. QR codes and pending login responses are temporary and visible only through the authenticated owner’s setup.

Saved platform credentials and message bodies are encrypted at rest. The server has the decryption keys and can read them to provide the service; this is not end-to-end encrypted storage.

Full-server recovery backups include the server’s decryption keys. Access to those backups is restricted to infrastructure operators; our hosting provider does not encrypt those server images at rest.

Legacy local collectors keep their platform sessions on that computer. The Discord extension stores its own queue in the browser and uploads captured messages to the archive.

<a id="allowance"></a>

## Archive allowance and full storage

Settings shows your current storage allowance and usage, shared by all connected platforms. Each captured revision counts, including copies of deleted messages. Usage includes encrypted content and associated archive records; it is not the size of an exported JSON file.

If an event will not fit, its hosted collector stops and keeps copies already in its encrypted queue. Other connections may also stop as they reach the limit. Queues have their own bounds, so an outage cannot grow them indefinitely. Activity during a stop may not be recoverable.

1. Export any history you want to keep elsewhere. Exporting alone does not release storage.
2. Delete messages you no longer need from their history panel, or choose a shorter retention period in Settings to remove older messages. Small deletion markers remain to prevent retries from restoring removed items.
3. Open Connections, choose Resume capture for a stopped hosted source, then Try again. Its saved session and queued copies are reused. Legacy local collectors must be restarted on their computer; the optional Discord extension can retry uploads, but you must start capture again.
4. If the notice says server storage or a connection queue is full, contact the operator. Deleting your archive may not resolve a server-wide or session-storage issue.

<a id="coverage"></a>

## Coverage and limits

- Only messages/events received by a collector can be archived. Past deleted messages cannot be recovered.
- Disappearing, self-destructing, and view-once content is excluded.
- Attachment names and metadata may be recorded. File contents are not downloaded.
- Unofficial Signal, WhatsApp, and Discord integrations can break when their platforms change. Discord forbids automated personal accounts and may terminate accounts using the experimental cloud connector.

<a id="retention"></a>

## Retention and export

Choose 7, 30, 90, or 365 days, or keep messages until you delete them. Retention is measured from first capture and applies to saved messages as well. Lowering retention immediately removes older messages. Export includes all captured versions in JSON.

<a id="deletion"></a>

## Disconnecting and deleting

- Disconnect removes the hosted login for that source and stops capture; it keeps your existing archive.
- Deleting an archived message removes its revisions and prevents later retries from recreating that item.
- Account deletion removes that account’s archive, sign-in sessions, and hosted platform sessions.
- Deleting here does not delete messages in the messaging platform. You can also unlink Afterword from the platform’s device settings. Deleted archive data may remain in restricted operational backups until they expire. Application backups keep the latest seven snapshots; daily server backups are retained for seven days.

<a id="use"></a>

## Archive with authorization

Connect only accounts you control and retain only conversations you are authorized to keep. Captured copies may remain after a participant edits or deletes the original.

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
