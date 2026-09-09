# Afterword

A hosted message archive with per-account workspaces and a local companion for Discord, Telegram, Signal and WhatsApp. New deliveries are captured before later edits or deletes. The archive includes searchable revision history, word-level comparisons, bookmarks, JSON exports, retention controls, and connection status.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5178. The unauthenticated interface is explicitly labeled sample data. Create an account for an empty private workspace. Development mode generates an archive encryption key in the ignored `data/` folder. No platform credentials are required to explore the demo.

```sh
npm run check
node deploy/package-companion.mjs
```

The production API serves the compiled UI on port 4318. Copy `.env.example` to `.env` for local configuration. In production, set `NODE_ENV=production`, `ARCHIVE_KEY` (32 bytes in hex), and HTTPS `PUBLIC_ORIGIN`. Set `INVITE_CODE` to keep registration private.

## Capture coverage

| Platform | Implementation | Coverage |
| --- | --- | --- |
| Discord | Official bot through discord.js | Accessible server channels and DMs to the bot; create, edit, delete, bulk delete |
| Telegram | Personal account through teleproto / MTProto | Ordinary cloud chats; new messages, edits, delivered deletion updates |
| Signal | Unofficial signal-cli linked device | Incoming and synced outgoing ordinary messages, edits and remote deletes |
| WhatsApp | Unofficial Baileys linked device | New deliveries, edits and revoke events exposed by the linked session |

**This is not universal access to every message on all four platforms.** Discord personal DMs are outside the supported bot integration. Disappearing/view-once content is excluded. Missing platform events, disconnected clients, and content deleted before capture cannot be reconstructed. Attachment metadata is supported; file bodies are not archived. Signal/WhatsApp linked-device compatibility is experimental until validated against the user's live accounts. See [companion setup](docs/COMPANION.md) and [platform findings](docs/PLATFORMS.md).

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

`npm test` exercises the actual encrypted archive, duplicate/out-of-order delivery, tenant isolation, retention, permanent deletion, session security, source-key revocation, all four event normalizers, and queue persistence/retry acknowledgments. `node tests/browser.mjs` runs a local UI walkthrough, real account onboarding, ingestion through the API, search, history, comparison, bookmarks, export, mobile layout, and connection creation. Tests create isolated accounts and delete them afterward.

The initial implementation is a single-node private beta. Search decrypts an account's messages in memory; it needs indexing and pagination at the storage layer before serving very large archives. There is no production uptime SLA, external monitoring, high availability, billing, or verified-email recovery. Live platform sign-in and capture must be smoke-tested after the user pairs each account; unit tests cannot prove live compatibility. Invite-only registration is recommended for the initial deployment.
