# undelete.chat

undelete.chat keeps the messages people delete. Link your personal WhatsApp, Telegram, or Signal account once, and undelete.chat runs a hosted linked device that watches new messages for a short window. Only a message the platform later reports as deleted is kept, together with any edits it had before deletion; everything else is discarded when the watch window ends. The archive of deleted messages supports bookmarks, JSON export, retention controls, and connection status.

## Self-hosting

undelete.chat is open source under the [AGPL-3.0](LICENSE). The hosted service at undelete.chat and a self-hosted install run the same code. To run your own:

```sh
git clone https://github.com/RonTuretzky/undelete.chat.git && cd undelete.chat
cp .env.example deploy/.env
# Set at least: NODE_ENV=production, ARCHIVE_KEY (64 hex characters; keep a copy outside the server),
# PUBLIC_ORIGIN=https://your.domain, HOSTED_COLLECTORS=true, TELEGRAM_API_ID and TELEGRAM_API_HASH (from my.telegram.org).
docker compose -f deploy/compose.yaml up -d --build
```

Put a TLS-terminating proxy such as Caddy in front of port 4318 on localhost (a two-line Caddyfile is in `deploy/deploy.py`). Billing is off unless Stripe keys are set; every account is then entitled. A 1 GB server handles a handful of linked accounts; see [operations](docs/OPERATIONS.md) for capacity, backups, monitoring, the security posture, and the monthly maintenance pass, and [platform findings](docs/PLATFORMS.md) for the platform rules you take on as the operator. There is no support commitment for self-hosted installs.

## Phone app

The app installs as a Progressive Web App on Android and iOS, with push notifications for recovered deletions (no message content in the payload). The Android app additionally offers device mode: a notification listener (`mobile/android/app/src/main/java/chat/undelete/app/NotificationCapture.java`) records messages from WhatsApp, Telegram, and Signal notifications into an on-device SQLite database, marks a message deleted when the platform replaces its notification text with a deletion notice, and keeps edits as versions. The web app reads it through the `DeviceArchive` Capacitor plugin under On this phone; nothing from device mode reaches the server. A separate phone-only edition (`mobile/scripts/build-android-local.sh`, app id `chat.undelete.app.local`) bundles the interface, contains only device mode, never connects to a server, and is published as a sideloadable APK at `/downloads/undelete-phone-only.apk` with a SHA-256 checksum. Capacitor shells for the App Store and Google Play are in `mobile/`; see [its README](mobile/README.md).

## User onboarding and documentation

Open **Help & guides** in the app or visit `/docs` for the public help center.The default hosted wizard shows a platform QR code directly in the authenticated website and any required sign-in prompt. It checks both the platform connection and first captured message.
The [user guides](docs/guides/README.md) are generated from `web/guides.mjs`, which also renders the help center. Run `npm run docs` after editing. `npm run package:companion` produces ZIP and tar.gz downloads with a minimal dependency manifest and offline copies of all guides. Existing connections can continue setup without creating another source; re-pairing rotates only that source’s archive token when the new code is redeemed.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5178. The unauthenticated interface is explicitly labeled sample data. Create an account for an empty private workspace. Development mode generates an archive encryption key in the ignored `data/` folder. No platform credentials are required to explore the demo.

```sh
npm run check
npm run package:companion
```

The production API serves the compiled UI on port 4318. Copy `.env.example` to `.env` for local configuration. In production, set `NODE_ENV=production`, `ARCHIVE_KEY` (32 bytes in hex), and HTTPS `PUBLIC_ORIGIN`. Registration is open by default; every new workspace starts a free trial. Set `INVITE_CODE` only if you want to close signups for a private beta.

## Plans and billing

Subscriptions run through Stripe Checkout and the Stripe customer portal; the server stores only the customer and subscription identifiers, the subscription status, and the period end. Every new workspace gets a free trial (`BILLING_TRIAL_DAYS`, default 14) without a card. When neither a trial nor an active, trialing, or past-due subscription applies, hosted collectors are suspended, `/api/ingest` returns a retryable `subscription_required` result so companions keep events queued, and hosted setup answers 402. Reading, search, export, retention, and account deletion keep working. Usernames in `BILLING_EXEMPT_USERS` (default `owner`) are never gated. Stripe posts `checkout.session.completed` and `customer.subscription.*` events to `/api/billing/webhook`, which verifies the signature with `STRIPE_WEBHOOK_SECRET` and fetches the subscription from Stripe rather than trusting the event body. Leave `STRIPE_SECRET_KEY` unset to run without billing. See [operations](docs/OPERATIONS.md#billing) for the production setup and the public [plans guide](docs/guides/billing.md).

## Capture coverage

| Platform | Implementation | What can be undeleted |
| --- | --- | --- |
| Telegram | Personal account through teleproto / MTProto | Ordinary cloud chat messages whose deletion update Telegram delivers to the linked session |
| Signal | Unofficial signal-cli linked device | Incoming and synced outgoing messages that receive a remote delete |
| WhatsApp | Unofficial Baileys linked device | Messages that receive a "delete for everyone" revoke while the linked device is connected |

Platforms also deliver reactions, link previews, pins, and formatting changes as edit events. An edit whose text and attachments match the current version is ignored, so a deleted message's history only shows real content changes.

**Only deletions the platform actually delivers can be undeleted.** A message deleted after the watch window ended, deleted before undelete.chat received it, or deleted while the linked device was offline cannot be recovered. Watch windows are per platform and per kind: a delete window (how long a message is held) and an edit window (how long edits to a held message are recorded). Defaults are each platform's limit plus a margin: WhatsApp 3 days and 1 hour, Signal 2 days and 2 days, Telegram 30 days and 3 days (`watch_config`). Deleted messages are kept until the user removes them unless they set a retention period.It is not an approved integration.Live account validation remains required. View-once media is excluded. Messages in chats with a disappearing timer are archived immediately by default (`keep_disappearing`), since the platform will erase them; when the setting is off they are held and kept only if deleted. Telegram's self-destructing media stays excluded because Telegram's API terms forbid preserving it. Missing platform events, disconnected clients, and content deleted before capture cannot be reconstructed. Attachment metadata is supported; file bodies are not archived. See [companion setup](docs/COMPANION.md) and [platform findings](docs/PLATFORMS.md).

## Architecture

- React/Vite dashboard, Express API, SQLite WAL storage on a persistent volume.
- Account passwords use salted scrypt. Session and connection tokens are stored as SHA-256 digests. Browser sessions use HttpOnly, SameSite=Strict cookies; production cookies require HTTPS.
- Message payloads (including chat and sender names) are sealed to a per-account P-256 key created in the browser: ephemeral ECDH, HKDF bound to the record's user/message/event context, AES-256-GCM. The server keeps only the public key and the private key wrapped under the password and the recovery key (PBKDF2 and AES-GCM, done on the device), so it can seal records as they arrive but never read them again; listing, history, search, and export decrypt on the device. Edit deduplication uses a keyed digest of the content. Accounts created before the key existed are re-sealed in the background. The server still sees each message transiently at capture because hosted collectors run there.
- Each companion key is scoped to one connection and account. The client cannot choose a different tenant or platform when ingesting events.
- Event inserts and message updates are atomic. Stable event IDs make replays idempotent. Versions are sorted by source time; a delete remains a tombstone even if earlier content arrives later. Missing originals are labeled.
- Retention uses the first capture date. Permanent message deletions retain only a hashed suppression marker so delayed retries cannot resurrect the content. Deleting an account cascades through messages, events, sessions, connections, and suppression markers.
- Hosted collectors use separate subprocesses and encrypted per-source SQLite queues. Each source receives a derived encryption key and only its own session configuration. Workers do not receive the server archive key or other sources’ credentials. WhatsApp authentication and Telegram sessions are encrypted directly; Signal uses temporary working files with encrypted five-second checkpoints.
- Hosted QR codes and prompts live only in memory and require an authenticated owner session. Prompt IDs are single-use. Disconnect removes stored platform sessions; account deletion stops all owned workers before removing records.
- Workers automatically reconnect after process failure and restore saved sessions after service restart. Closing the website or turning off the user’s computer does not stop a hosted collector.

## Hosted configuration

Set `HOSTED_COLLECTORS=true`, configure `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` once for the application, and set `HOSTED_MAX_COLLECTORS` to a capacity tested on your server. The production image includes checksum-verified signal-cli 0.14.7. Its private working files use `/tmp` mounted as tmpfs. Large native libraries expand into separate per-worker directories on the `signal-native-cache` disk volume; that cache contains no account sessions and is cleared on worker exit and service startup. Keep `ARCHIVE_KEY` stable and separately backed up: all hosted queue keys derive from it.

For the managed deployment, private `~/.config/afterword/hosted-config.json` supplies `enabled`, `max_collectors`, `telegram_api_id`, and `telegram_api_hash`; these never belong in Git. Customers do not need developer API credentials or a local installation. The default global limit is four collectors; the production deployment sets `max_collectors` to 30 on a 2 vCPU / 4 GB server sized for about 20 customers. Beyond that, resize the server first; see [operations](docs/OPERATIONS.md#cost-and-capacity).

## Deployment

The user selected DigitalOcean. `deploy/provision.py` provisions a dedicated 1 GB VM in NYC3, currently $6/month, and reuses its recorded ID on subsequent calls. It does not modify existing servers. Credentials and deployment state are read from `~/.config/afterword/`, outside this repository.

`deploy/compose.yaml` runs a non-root, read-only application container with a named persistent data volume. Caddy on the host provides HTTPS and reverse proxies to a localhost-only app port. The initial hostname uses sslip.io; replace it with a domain you own before a public launch. Keep the archive encryption key and owner credentials in a password manager. Losing the encryption key loses access to the archive.

Use `docker compose -f deploy/compose.yaml up -d --build` to update. Do not use `down -v`: it deletes the archive volume. Production creates an online SQLite backup at startup and every 24 hours, retaining the latest seven snapshots in `/data/backups`. Application snapshots contain encrypted collector queues and the archive; the encryption key must be backed up separately. `node server/backup.mjs` creates a manual snapshot. Daily DigitalOcean server images, an external availability check against `/api/monitor`, and email alerts for outages, certificate expiry, disk, and memory are configured for this deployment. Full-server images also include the decryption configuration. The first image completed on September 10; a full image restore and actual alert delivery remain unverified. See [the operations guide](docs/OPERATIONS.md) for costs, key handling, restore steps, and verification commands. Encrypted off-server replication and restore commands are implemented but Spaces storage activation remains pending; see [offsite backups](docs/OFFSITE-BACKUPS.md). No billing/subscription integration, email delivery, or multi-region service is configured.

## Validation and operating limits

`npm test` exercises the actual encrypted archive, duplicate/out-of-order delivery, tenant isolation, retention, permanent deletion, session security, source-key revocation, all four event normalizers, queue persistence, and pairing-code ownership, expiry, replay rejection, and credential rotation. The existing `tests/browser.mjs` describes a local UI walkthrough, real account onboarding, ingestion through the API, search, history, comparison, bookmarks, export, mobile layout, and connection creation.

Archive pages paginate in SQLite, historical search scans encrypted revisions in bounded batches, and JSON exports stream with backpressure. See [archive storage and verification](docs/ARCHIVE-STORAGE.md) for resource limits, the disposable large-archive benchmark, and remaining scaling work.

The legacy `tests/onboarding-browser.mjs` describes checks for all eight public guides, desktop/mobile layouts, preserving a platform choice through signup, all four connection wizards, Windows commands, resuming unfinished setup, code replacement, ZIP downloads, and first-message verification. It uses simulated collectors against the real API and does not sign into providers or send platform messages. Browser tests create isolated accounts and delete them afterward. Set `TEST_URL` for a deployed instance and `TEST_INVITE_FILE` to a private invitation-code file when registration requires one.

`tests/hosted.test.mjs` uses real worker subprocesses with a simulated provider to verify owner-only QR/prompt endpoints, actual encrypted session restoration, process failure recovery, capacity enforcement, revocation, event routing, and encrypted WhatsApp/Signal persistence. It does not prove live provider connectivity. Use the permitted CUA browser tooling for current UI verification; legacy standalone browser scripts are not the current validation path.

The current deployment is a single node with open registration and a free trial. Search decrypts an account's messages in memory; it needs indexing and pagination at the storage layer before serving very large archives. There is no production uptime SLA, external monitoring, high availability, billing, or verified-email recovery. Account recovery uses single-use keys issued at registration or generated in Settings; successful recovery rotates the key and revokes previous sessions. Live platform sign-in and capture must be smoke-tested after the user pairs each account; unit tests cannot prove live compatibility. Invite-only registration is recommended for the initial deployment.

