# SaaS readiness and evidence

Objective: deliver Afterword as a remote, multi-user service for personal Telegram, Signal, WhatsApp, and Discord message history. A website that depends on the owner's Mac is not completion.

## Required outcomes

- Hosted Telegram, Signal, and WhatsApp account linking from the authenticated website, with no local installation.
- Continuous server capture after the browser closes; persistent sessions and restart/reconnect recovery.
- Separate account/session/message state per user and source, owner-only QR/login controls, encrypted persistent credentials, cancellation, pause, disconnect, and account deletion.
- Discord personal-account capture that meets the user's remote requirement. Current extension does not meet this; no supported unrestricted personal cloud API has been established. Preserve this as an unresolved requirement.
- Clear coverage, limitations, setup instructions, visible error recovery, and verified responsive onboarding.
- Registration, authentication, recovery, retention, export, limits, and the chosen access/payment model.
- Production deployment, backups with a verified restore, health monitoring, capacity boundaries, security checks, and actual live capture verification for each supported platform.

## Evidence log

- Before hosted migration: live archive runs on DigitalOcean; all three non-Discord collectors depend on local companion processes. Discord browser extension is experimental and requires an open tab.
- Hosted implementation: authenticated browser QR and prompt flows; separate worker/queue per source; encrypted sessions; automatic restart; pause, disconnect, relink, and erasure implemented.
- Automated suite: real subprocess restart/restore against simulated provider events, HTTP ownership/CSRF checks, concurrent capacity enforcement, encrypted auth stores, recovery-key rotation/replay rejection, backup/restore, native cache cleanup, and Signal shutdown ordering. Simulated providers are not evidence of live platform compatibility.
- Live 2026-09-10: existing owner Telegram and WhatsApp sessions moved to DigitalOcean. Both local processes stopped. Server reports both connected. New ordinary messages have arrived from both after migration. Telegram Saved Messages test captured create plus edit, retaining both versions. Deletion capture and WhatsApp edits still need live verification.
- Live browser check: a temporary, empty customer workspace rendered a real server-generated WhatsApp QR from the public HTTPS app. Test account and its pending collector were deleted afterward. Hosted QR layout was widened following visual inspection.
- Signal runtime: a live server probe exposed a native library that could not load from noexec tmpfs, then exceeded a 128 MB executable tmpfs. Native libraries now use a separate disk cache; the actual hosted worker successfully produces a Signal linking QR. A phone scan and live capture verification remain outstanding.
- Recovery: registration issues a single-use recovery key; Settings can replace it after password confirmation; recovery rotates the key and invalidates old sessions. Email recovery is not configured.
- Backups: startup/daily online snapshots of collector queues then archive, last seven retained. A production snapshot was downloaded off the server and restored in an isolated local directory: SQLite integrity passed; all 49 messages in that snapshot and both linked sessions decrypted. Automated off-site replication remains outstanding.
- Access/payment model: asked user; pending.

## Completion blockers

Live phone scans require the account holder. Discord's supported cloud access remains unresolved. These do not prevent completing server infrastructure and the other platforms.
