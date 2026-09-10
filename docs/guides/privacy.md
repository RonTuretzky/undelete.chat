# Your data, privacy, and retention

What Afterword stores and how to remove it.

<a id="storage"></a>

## Hosted sessions and message copies

Hosted collectors run on Afterword’s server. Platform login sessions, ordinary captured messages, and the revisions received by each collector are stored separately for each source. QR codes and pending login responses are temporary and visible only through the authenticated owner’s setup.

Saved platform credentials and message bodies are encrypted at rest. The server has the decryption keys and can read them to provide the service; this is not end-to-end encrypted storage.

Full-server recovery backups include the server’s decryption keys. Access to those backups is restricted to infrastructure operators; our hosting provider does not encrypt those server images at rest.

Legacy local collectors keep their platform sessions on that computer. The Discord extension stores its own queue in the browser and uploads captured messages to the archive.

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
