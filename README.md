# Afterword

A hosted message archive for individuals, with per-account workspaces and a local companion for personal Telegram, Signal and WhatsApp accounts, plus an experimental Chrome extension for personal Discord DMs and group DMs. New deliveries are captured before later edits or deletes. The archive includes searchable revision history, word-level comparisons, bookmarks, JSON exports, retention controls, and connection status.

## User onboarding and documentation

Open **Help & guides** in the app or visit `/docs` for the public help center. It covers first setup, personal-account connection guides, including the Discord browser extension, troubleshooting, continuous capture, and privacy. The in-app wizard uses a single-use, ten-minute pairing code; the companion automatically saves its connection key and assigns an isolated profile. It then waits for a real platform heartbeat and first message rather than marking setup complete after a download.

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

## Capture coverage

| Platform | Implementation | Coverage |
| --- | --- | --- |
| Discord | Passive Chrome extension (experimental) | Identified personal DMs and group DMs delivered to a selected Discord Web tab; create, edit, delete. No server channels or bot tokens. |
| Telegram | Personal account through teleproto / MTProto | Ordinary cloud chats; new messages, edits, delivered deletion updates |
| Signal | Unofficial signal-cli linked device | Incoming and synced outgoing ordinary messages, edits and remote deletes |
| WhatsApp | Unofficial Baileys linked device | New deliveries, edits and revoke events exposed by the linked session |

**This is not universal access to every message on all four platforms.** Discord uses the extension rather than a bot. It requires Chrome 125+, debugging permission, and an open signed-in Discord Web tab. Automated compressed-stream and archive tests pass; live account validation remains required. Disappearing/view-once content is excluded. Missing platform events, disconnected clients, and content deleted before capture cannot be reconstructed. Attachment metadata is supported; file bodies are not archived. Signal/WhatsApp linked-device compatibility is experimental until validated against the user's live accounts. See [companion setup](docs/COMPANION.md) and [platform findings](docs/PLATFORMS.md).

## Architecture

- React/Vite dashboard, Express API, SQLite WAL storage on a persistent volume.
- Account passwords use salted scrypt. Session and connection tokens are stored as SHA-256 digests. Browser sessions use HttpOnly, SameSite=Strict cookies; production cookies require HTTPS.
- Message payloads (including chat and sender names) are AES-256-GCM encrypted with event/user context authenticated as additional data. The server holds the encryption key, so it can decrypt messages for search and display. This is encryption at rest, not end-to-end cloud encryption.
- Each companion key is scoped to one connection and account. The client cannot choose a different tenant or platform when ingesting events.
- Event inserts and message updates are atomic. Stable event IDs make replays idempotent. Versions are sorted by source time; a delete remains a tombstone even if earlier content arrives later. Missing originals are labeled.
- Retention uses the first capture date. Permanent message deletions retain only a hashed suppression marker so delayed retries cannot resurrect the content. Deleting an account cascades through messages, events, sessions, connections, and suppression markers.
- The local encrypted SQLite retry queue survives restarts and archive outages. Platform connection sessions and required metadata stay with the companion.

## Deployment

The user selected DigitalOcean. `deploy/provision.py` provisions a dedicated 1 GB VM in NYC3, currently $6/month, and reuses its recorded ID on subsequent calls. It does not modify existing servers. Credentials and deployment state are read from `~/.config/afterword/`, outside this repository.

`deploy/compose.yaml` runs a non-root, read-only application container with a named persistent data volume. Caddy on the host provides HTTPS and reverse proxies to a localhost-only app port. The initial hostname uses sslip.io; replace it with a domain you own before a public launch. Keep the archive encryption key and owner credentials in a password manager. Losing the encryption key loses access to the archive.

Use `docker compose -f deploy/compose.yaml up -d --build` to update. Do not use `down -v`: it deletes the archive volume. Backups should use SQLite's online backup API and must include the encryption key in a separate protected backup. The initial deployment does not automatically enable paid DigitalOcean backups. No billing/subscription integration, email delivery/password reset, or multi-region service is configured.

## Validation and operating limits

`npm test` exercises the actual encrypted archive, duplicate/out-of-order delivery, tenant isolation, retention, permanent deletion, session security, source-key revocation, all four event normalizers, queue persistence, and pairing-code ownership, expiry, replay rejection, and credential rotation. `node tests/browser.mjs` runs a local UI walkthrough, real account onboarding, ingestion through the API, search, history, comparison, bookmarks, export, mobile layout, and connection creation.

`node tests/onboarding-browser.mjs` checks all eight public guides, desktop/mobile layouts, preserving a platform choice through signup, all four connection wizards, Windows commands, resuming unfinished setup, code replacement, ZIP downloads, and first-message verification. It uses simulated collectors against the real API and does not sign into providers or send platform messages. Browser tests create isolated accounts and delete them afterward. Set `TEST_URL` for a deployed instance and `TEST_INVITE_FILE` to a private invitation-code file when registration requires one.

The initial implementation is a single-node private beta. Search decrypts an account's messages in memory; it needs indexing and pagination at the storage layer before serving very large archives. There is no production uptime SLA, external monitoring, high availability, billing, or verified-email recovery. Live platform sign-in and capture must be smoke-tested after the user pairs each account; unit tests cannot prove live compatibility. Invite-only registration is recommended for the initial deployment.

## Personal Discord browser collector

`npm run package:discord` creates `dist/afterword-discord-extension.zip` and its unpacked folder. The web setup serves the ZIP and an archive pairing code; no Node.js installation is needed for Discord users. The extension observes inbound Gateway WebSocket frames through Chrome's debugger API, supports JSON, zlib-stream and zstd-stream, and filters events to known personal DM/group-DM channels. It never creates a Discord API session or reads outgoing frames, HTTP response bodies, request headers or cookies.

Its private IndexedDB stores encrypted queue entries and metadata, with a non-extractable AES-GCM key in the same profile. The queue is capped at 10,000 events; message metadata expires after seven days. The first observed account identity binds the source. Account switching, decoding failures, and queue exhaustion stop capture visibly. Stop/Start controls, account pairing, and a visible Chrome debugging notice keep capture user-controlled. This is an unofficial downloadable beta, not an approved Discord integration or Chrome Web Store listing.
