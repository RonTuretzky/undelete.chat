# Afterword companion

Your companion receives messages on your computer and sends captured versions to your private Afterword archive. Start with the connection setup screen in the web app; it fills in your server address and follows your progress.

For Discord, follow the [browser extension guide](guides/discord.md). The terminal instructions below apply to Telegram, Signal, and WhatsApp.

## First connection

1. Install [Node.js LTS](https://nodejs.org/en/download), version 22.13 or newer.
2. In Afterword, open **Connections**, choose a platform, and review its access requirements.
3. Download the companion ZIP, extract it, and open a terminal in the `afterword-companion` folder.
4. Run `npm ci --omit=dev` once. On Windows, use `npm.cmd` if needed.
5. Copy the **pairing command** from the setup screen. It looks like `npm start -- pair --server https://YOUR-SERVER`.
6. Enter the short pairing code when the terminal asks. Each code works once and expires after ten minutes.
7. Follow the platform sign-in or QR prompts. Keep the browser setup open until it confirms connection, then send your own test message in a covered conversation.

Platform credentials and sessions stay on the computer running the companion. Your Afterword server can decrypt captured message content; the cloud archive is encrypted at rest, not end-to-end encrypted.

## Step-by-step guides

- [Start your first archive](guides/getting-started.md) — includes Windows, macOS, and Linux terminal instructions.
- [Connect WhatsApp](guides/whatsapp.md) — linked-device QR pairing through unofficial Baileys.
- [Connect Telegram](guides/telegram.md) — application credentials, phone sign-in, and verification.
- [Connect your personal Discord](guides/discord.md) — use the separate Chrome extension; no terminal or bot setup.
- [Connect Signal](guides/signal.md) — install signal-cli and link your phone by QR code.
- [Troubleshooting](guides/troubleshooting.md) — expired codes, missing messages, bad credentials, and relinking.
- [Continuous capture and local storage](guides/running.md) — resume, additional accounts, updates, and background operation.
- [Privacy and deletion](guides/privacy.md) — scope, retention, exports, disconnecting, and removing local data.

The same guides are available under **Help & guides** in the web app, including before sign-in. This download includes offline copies.

## Resume an existing connection

Copy its **Resume command & help** instructions from Connections. Pairing assigns a unique profile name:

```sh
npm start -- run telegram-a1b2c3d4
```

The name above is an example: use your own source's profile. Run one process per profile. Leave the computer awake and the terminal open. Closing the browser is fine; closing the companion interrupts capture. For another source, open another terminal and use its pairing code. You do not need to install a separate program copy.

## Useful commands

```sh
npm start -- help
npm start -- doctor
npm start -- credentials YOUR-PROFILE
npm start -- relink YOUR-PROFILE
```

`doctor` checks Node.js and signal-cli availability. `credentials` replaces saved Telegram app credentials without deleting the queue. `relink` asks you to type `RELINK` before clearing a Telegram, Signal, or WhatsApp platform session; it preserves your archive key and queued events. Stop that profile's other process first, then run its Resume command to sign in again. See the troubleshooting guide before using these commands.

For advanced users with an existing long-lived connection key, `npm start -- setup YOUR-PROFILE` remains available. Older profiles keep their chosen names; their Resume command is `npm start -- run YOUR-ORIGINAL-PROFILE`.

## Limits to understand

Capture starts when a running, authorized companion receives a message. It cannot recover an unseen earlier revision or guarantee events the platform never delivers. Personal Discord uses the separate browser extension and observes identified DMs delivered to the chosen Discord Web tab. The terminal companion does not connect Discord. Disappearing/view-once content is excluded. Attachments preserve filenames/types, not file contents. Signal and WhatsApp integrations are unofficial and need live verification and maintenance.

Local profiles live inside `.afterword` in your user home directory. Platform sessions, credentials, and the encrypted retry queue are stored there with restricted permissions. Some metadata remains to correlate edits. Deleting cloud history does not erase local files or backups. Read the privacy guide before removing a profile or sharing a diagnostic report.
