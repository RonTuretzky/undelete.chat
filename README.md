# Afterword

A hosted message archive for individuals, with per-account workspaces and hosted collectors for personal Telegram, Signal and WhatsApp accounts. Personal Discord has an explicitly experimental cloud connector and an optional browser extension. New deliveries are captured before later edits or deletes. The archive includes searchable revision history, word-level comparisons, bookmarks, JSON exports, retention controls, and connection status.

## User onboarding and documentation

Open **Help & guides** in the app or visit `/docs` for the public help center. It covers first setup, personal-account connection guides, including the Discord browser extension, troubleshooting, continuous capture, and privacy. The default hosted wizard shows a platform QR code directly in the authenticated website and any required sign-in prompt. It checks both the platform connection and first captured message. Existing local companion and Discord extension pairing remain available as separate modes.

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

The production API serves the compiled UI on port 4318. Copy `.env.example` to `.env` for local configuration. In production, set `NODE_ENV=production`, `ARCHIVE_KEY` (32 bytes in hex), and HTTPS `PUBLIC_ORIGIN`. Set `INVITE_CODE` to keep registration private.

## Plans and billing

Subscriptions run through Stripe Checkout and the Stripe customer portal; the server stores only the customer and subscription identifiers, the subscription status, and the period end. Every new workspace gets a free trial (`BILLING_TRIAL_DAYS`, default 14) without a card. When neither a trial nor an active, trialing, or past-due subscription applies, hosted collectors are suspended, `/api/ingest` returns a retryable `subscription_required` result so companions keep events queued, and hosted setup answers 402. Reading, search, export, retention, and account deletion keep working. Usernames in `BILLING_EXEMPT_USERS` (default `owner`) are never gated. Stripe posts `checkout.session.completed` and `customer.subscription.*` events to `/api/billing/webhook`, which verifies the signature with `STRIPE_WEBHOOK_SECRET` and fetches the subscription from Stripe rather than trusting the event body. Leave `STRIPE_SECRET_KEY` unset to run without billing. See [operations](docs/OPERATIONS.md#billing) for the production setup and the public [plans guide](docs/guides/billing.md).

## Capture coverage

| Platform | Implementation | Coverage |
| --- | --- | --- |
| Discord | Unofficial personal cloud session; optional Chrome extension | Identified personal DMs and group DMs delivered to the session; create, edit, delete. No server channels. Cloud access can violate Discord's rules and put accounts at risk. |
| Telegram | Personal account through teleproto / MTProto | Ordinary cloud chats; new messages, edits, delivered deletion updates |
| Signal | Unofficial signal-cli linked device | Incoming and synced outgoing ordinary messages, edits and remote deletes |
| WhatsApp | Unofficial Baileys linked device | New deliveries, edits and revoke events exposed by the linked session |

Platforms also deliver reactions, link previews, pins, and formatting changes as edit events. The archive acknowledges an edit whose text and attachments match the current version without recording a new revision, so the timeline only shows content changes.

**This is not universal access to every message on all four platforms.** Discord's cloud connector requires phone approval and acknowledgement that Discord forbids automated personal accounts and may terminate them. It is not an approved integration. Its optional extension requires Chrome 125+, debugging permission, and an open signed-in Discord Web tab. Live account validation remains required. Disappearing/view-once content is excluded. Missing platform events, disconnected clients, and content deleted before capture cannot be reconstructed. Attachment metadata is supported; file bodies are not archived. See [companion setup](docs/COMPANION.md) and [platform findings](docs/PLATFORMS.md).

## Architecture

- React/Vite dashboard, Express API, SQLite WAL storage on a persistent volume.
- Account passwords use salted scrypt. Session and connection tokens are stored as SHA-256 digests. Browser sessions use HttpOnly, SameSite=Strict cookies; production cookies require HTTPS.
- Message payloads (including chat and sender names) are AES-256-GCM encrypted with event/user context authenticated as additional data. The server holds the encryption key, so it can decrypt messages for search and display. This is encryption at rest, not end-to-end cloud encryption.
- Each companion key is scoped to one connection and account. The client cannot choose a different tenant or platform when ingesting events.
- Event inserts and message updates are atomic. Stable event IDs make replays idempotent. Versions are sorted by source time; a delete remains a tombstone even if earlier content arrives later. Missing originals are labeled.
- Retention uses the first capture date. Permanent message deletions retain only a hashed suppression marker so delayed retries cannot resurrect the content. Deleting an account cascades through messages, events, sessions, connections, and suppression markers.
- Hosted collectors use separate subprocesses and encrypted per-source SQLite queues. Each source receives a derived encryption key and only its own session configuration. Workers do not receive the server archive key or other sources’ credentials. WhatsApp authentication and Telegram sessions are encrypted directly; Signal uses temporary working files with encrypted five-second checkpoints.
- Hosted QR codes and prompts live only in memory and require an authenticated owner session. Prompt IDs are single-use. Disconnect removes stored platform sessions; account deletion stops all owned workers before removing records.
- Workers automatically reconnect after process failure and restore saved sessions after service restart. Closing the website or turning off the user’s computer does not stop a hosted collector.

## Hosted configuration

Set `HOSTED_COLLECTORS=true`, configure `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` once for the application, and set `HOSTED_MAX_COLLECTORS` to a capacity tested on your server. The production image includes checksum-verified signal-cli 0.14.7. Its private working files use `/tmp` mounted as tmpfs. Large native libraries expand into separate per-worker directories on the `signal-native-cache` disk volume; that cache contains no account sessions and is cleared on worker exit and service startup. Keep `ARCHIVE_KEY` stable and separately backed up: all hosted queue keys derive from it.

For the managed deployment, private `~/.config/afterword/hosted-config.json` supplies `enabled`, `max_collectors`, `telegram_api_id`, and `telegram_api_hash`; these never belong in Git. Customers do not need developer API credentials or a local installation. The default global limit is four collectors for the current small server; additional customers require capacity work, not merely enabling public signup.

`DISCORD_PERSONAL_CLOUD=true` (managed field `discord_personal_cloud`) enables the separate Discord experiment. It is disabled by default. Every user must acknowledge its account risk before the API permits linking. A phone-approved personal session is encrypted in the source queue and never returned to the frontend. The connector sends only authentication/resume/heartbeat traffic, filters incoming events to identified private channels, and stops for verification challenges or revoked credentials. It never attempts CAPTCHA solving. A live unauthenticated QR handshake succeeded from DigitalOcean; full phone approval and capture are not yet verified.

## Deployment

The user selected DigitalOcean. `deploy/provision.py` provisions a dedicated 1 GB VM in NYC3, currently $6/month, and reuses its recorded ID on subsequent calls. It does not modify existing servers. Credentials and deployment state are read from `~/.config/afterword/`, outside this repository.

`deploy/compose.yaml` runs a non-root, read-only application container with a named persistent data volume. Caddy on the host provides HTTPS and reverse proxies to a localhost-only app port. The initial hostname uses sslip.io; replace it with a domain you own before a public launch. Keep the archive encryption key and owner credentials in a password manager. Losing the encryption key loses access to the archive.

Use `docker compose -f deploy/compose.yaml up -d --build` to update. Do not use `down -v`: it deletes the archive volume. Production creates an online SQLite backup at startup and every 24 hours, retaining the latest seven snapshots in `/data/backups`. Application snapshots contain encrypted collector queues and the archive; the encryption key must be backed up separately. `node server/backup.mjs` creates a manual snapshot. Daily DigitalOcean server images, an external availability check against `/api/monitor`, and email alerts for outages, certificate expiry, disk, and memory are configured for this deployment. Full-server images also include the decryption configuration. The first image completed on September 10; a full image restore and actual alert delivery remain unverified. See [the operations guide](docs/OPERATIONS.md) for costs, key handling, restore steps, and verification commands. Encrypted off-server replication and restore commands are implemented but Spaces storage activation remains pending; see [offsite backups](docs/OFFSITE-BACKUPS.md). No billing/subscription integration, email delivery, or multi-region service is configured.

## Validation and operating limits

`npm test` exercises the actual encrypted archive, duplicate/out-of-order delivery, tenant isolation, retention, permanent deletion, session security, source-key revocation, all four event normalizers, queue persistence, and pairing-code ownership, expiry, replay rejection, and credential rotation. The existing `tests/browser.mjs` describes a local UI walkthrough, real account onboarding, ingestion through the API, search, history, comparison, bookmarks, export, mobile layout, and connection creation.

Archive pages paginate in SQLite, historical search scans encrypted revisions in bounded batches, and JSON exports stream with backpressure. See [archive storage and verification](docs/ARCHIVE-STORAGE.md) for resource limits, the disposable large-archive benchmark, and remaining scaling work.

The legacy `tests/onboarding-browser.mjs` describes checks for all eight public guides, desktop/mobile layouts, preserving a platform choice through signup, all four connection wizards, Windows commands, resuming unfinished setup, code replacement, ZIP downloads, and first-message verification. It uses simulated collectors against the real API and does not sign into providers or send platform messages. Browser tests create isolated accounts and delete them afterward. Set `TEST_URL` for a deployed instance and `TEST_INVITE_FILE` to a private invitation-code file when registration requires one.

`tests/hosted.test.mjs` uses real worker subprocesses with a simulated provider to verify owner-only QR/prompt endpoints, actual encrypted session restoration, process failure recovery, capacity enforcement, revocation, event routing, and encrypted WhatsApp/Signal persistence. It does not prove live provider connectivity. Use the permitted CUA browser tooling for current UI verification; legacy standalone browser scripts are not the current validation path.

The current deployment is a single-node private beta. Search decrypts an account's messages in memory; it needs indexing and pagination at the storage layer before serving very large archives. There is no production uptime SLA, external monitoring, high availability, billing, or verified-email recovery. Account recovery uses single-use keys issued at registration or generated in Settings; successful recovery rotates the key and revokes previous sessions. Live platform sign-in and capture must be smoke-tested after the user pairs each account; unit tests cannot prove live compatibility. Invite-only registration is recommended for the initial deployment.

## Personal Discord browser collector

`npm run package:discord` creates `dist/afterword-discord-extension.zip` and its unpacked folder. The web setup serves the ZIP and an archive pairing code; no Node.js installation is needed for Discord users. The extension observes inbound Gateway WebSocket frames through Chrome's debugger API, supports JSON, zlib-stream and zstd-stream, and filters events to known personal DM/group-DM channels. It never creates a Discord API session or reads outgoing frames, HTTP response bodies, request headers or cookies.

Its private IndexedDB stores encrypted queue entries and metadata, with a non-extractable AES-GCM key in the same profile. The queue is capped at 10,000 events; message metadata expires after seven days. The first observed account identity binds the source. Account switching, decoding failures, and queue exhaustion stop capture visibly. Stop/Start controls, account pairing, and a visible Chrome debugging notice keep capture user-controlled. This is an unofficial downloadable beta, not an approved Discord integration or Chrome Web Store listing.
