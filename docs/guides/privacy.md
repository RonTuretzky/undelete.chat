# Your archive, your controls

Understand access, encryption, retention, and deletion before you connect.

<a id="access"></a>

## What you authorize

Connect only accounts and conversations you are authorized to retain. The current collectors capture covered conversations the linked account or bot receives; per-chat allowlists are not available in this release.

The archive can preserve a captured copy after another participant edits or deletes the original. Set expectations with the people or communities whose conversations you archive.

<a id="encryption"></a>

## Where messages and credentials go

Platform credentials and sessions are stored on the computer running your companion. Captured message events are sent to your Afterword server over HTTPS. Message bodies and related names are encrypted in its database.

The server holds the encryption key and decrypts messages for search and display. This is encryption at rest, not end-to-end encrypted cloud storage. Your Afterword operator controls the server and its backups.

<a id="retention"></a>

## Choose how long to keep messages

Settings → Archive retention lets you choose 7, 30, or 90 days, one year, or until you delete them. Age is measured from the first capture, and saved/bookmarked messages follow the same policy.

Shortening retention immediately removes older messages. Export first if you need a copy. A deletion in the source app does not itself remove the saved archive.

<a id="deletion"></a>

## Disconnecting and deleting are different

- Pause: stops storing newly delivered events until resumed. Paused events are discarded.
- Disconnect source: revokes its archive key while preserving captured cloud history. Also unlink the companion in the platform app if you want to end platform access.
- Delete archived message: removes its cloud revisions and prevents queued retries from restoring them. It does not delete the message in the original app.
- Delete account: after password confirmation, removes its messages, connections, and sessions from the running archive database.
- Remove local data: stop the companion, revoke/unlink the platform session, then remove that source’s profile folder. Cloud deletion does not delete files or backups on your computer.

> Exports and backups are separate copies. The initial deployment has no automatic backup deletion service; the instance operator must manage any backups they create.

<a id="limits"></a>

## What cannot be recovered

- A message or earlier version the companion never received.
- Changes missed while the computer, platform session, or network was unavailable.
- Content outside a platform connection’s documented scope.
- Disappearing/view-once content excluded by the collector, or attachment file bodies that were never downloaded.

- [WhatsApp coverage](./whatsapp.md)
- [Telegram coverage](./telegram.md)
- [Discord coverage](./discord.md)
- [Signal coverage](./signal.md)

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
