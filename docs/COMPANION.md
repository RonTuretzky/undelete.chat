# Afterword companion

The companion runs on your own computer and sends captured message events to your Afterword archive. Platform sessions stay on that computer. The archive server can decrypt message content; this is not end-to-end encrypted cloud storage.

Requires Node.js 22.13 or newer. Unpack the download, open a terminal in its folder, and run:

```sh
npm ci
npm run companion -- setup telegram
```

Enter your archive's HTTPS URL and the connection key shown in the dashboard. The platform is detected from that key. Keys and passwords are entered interactively rather than placed in shell history. Use a separate profile for each connection:

```sh
npm run companion -- setup discord
npm run companion -- setup signal
npm run companion -- setup whatsapp
```

Resume without pairing again:

```sh
npm run companion -- run telegram
```

Each connection needs its own running process. Closing the terminal stops capture; use a process supervisor on an always-on computer for continuous operation. Sleeping computers and disconnected sessions create coverage gaps. The companion replays already-captured events after an archive server outage. It cannot recover message versions it never received.

## Platform setup and coverage

**Telegram:** Get your own application `api_id` and `api_hash` from https://my.telegram.org/apps. The companion asks for these and your phone/code/2FA. It captures new cloud-chat messages, edits, and delivered deletion events through the Telegram API. It does not join chats or send messages. Secret chats, view-once media, and messages carrying a self-destruct/auto-delete lifetime are excluded. Telegram deletion notifications are not completely reliable. No historical backfill is performed. See https://core.telegram.org/api/terms and https://docs.teleproto.dev/.

**Discord:** Create a bot at https://discord.com/developers/applications, enable **Message Content Intent**, and invite it to authorized servers with **View Channels** and **Read Message History** permissions. Enter the bot token locally. Captures messages, content updates, single deletes and bulk deletes in accessible channels, plus DMs addressed to the bot. It does **not** capture private DMs between personal user accounts. Discord prohibits self-bots: https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots. Verified apps may need privileged intent approval. Bot installation and event transport do not by themselves establish permission to retain all content; server operators must configure archiving appropriately.

**Signal:** Install a current signal-cli release using https://github.com/AsamK/signal-cli/blob/master/README.md and make `signal-cli` available on your PATH. Some builds require a current Java runtime. The companion starts an isolated signal-cli configuration, generates a QR code, and waits for pairing through Signal → Settings → Linked devices. It captures ordinary incoming messages, synced outgoing messages, edits, and remote delete events. Disappearing and view-once content is excluded. signal-cli is unofficial and needs updates as Signal changes. This does not read your existing Signal Desktop database.

**WhatsApp:** Scan the QR code using WhatsApp → Settings → Linked devices. The companion uses the unofficial Baileys library. It captures new message deliveries, edit wrappers, and revoke/delete events exposed by the linked session. It skips history sync, stories, reactions, disappearing and view-once content. This is not the WhatsApp Business API and is not endorsed by Meta. Compatibility and account restrictions are material risks: https://github.com/WhiskeySockets/Baileys.

## Local storage and retries

Profiles live in `~/.afterword/<profile>/` with owner-only permissions. The configuration contains the archive connection key and, where needed, application/bot credentials. The queue and Telegram session are encrypted with a local key stored separately in that same protected directory. WhatsApp and signal-cli manage their own session files inside the profile. Protect the computer and its backups; someone with access to both the database and its key can decrypt it.

During server outages, captured events stay in the SQLite retry queue. Acknowledged events leave the queue. Failed payloads are retained for diagnosis, and the companion reports a warning rather than silently dropping them. To revoke the connection, disconnect it in the dashboard; the companion stops after the next authorization check. Pausing a connection discards newly delivered archive events until resumed.

Attachment filenames/types are archived; binary file contents are not downloaded. Platform names, message bodies and author names are never intentionally written to console logs. The local metadata cache needed to correlate partial edits can retain information until the profile directory is removed. Deleting a cloud archive does not automatically wipe the local profile. Stop the process and delete its profile directory when you no longer need it, then revoke linked devices inside the platform app.

## Running continuously

On Linux, use systemd with a service under your own user. Set `WorkingDirectory` to the extracted folder and `ExecStart` to your absolute Node path followed by `companion/index.mjs run <profile>`. Set `Restart=on-failure`, `RestartSec=10`, and `UMask=0077`. Complete initial QR/sign-in interactively first. On macOS, use an equivalent LaunchAgent or keep a dedicated terminal running with sleep disabled. Do not use the same profile in two processes at once.

## Verification

After pairing, the dashboard should show **Capturing messages**. Send a test message yourself in a covered conversation, edit it, and delete it. The archive should show both content versions and a deletion marker. Test each platform with your own account before relying on the archive. You need to be authorized to retain the conversations you connect.
