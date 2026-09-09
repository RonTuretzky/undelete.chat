# Keep your archive up to date

Resume safely, connect more accounts, and understand what stays on your computer.

<a id="keep-running"></a>

## Keep capture running

Leave the companion terminal open and keep the computer awake and connected to the internet. Closing it, sleeping, or unlinking the device interrupts capture. Messages that change during a gap may never be recoverable.

1. To stop, press Ctrl+C in the companion terminal.
2. To resume, reopen a terminal in the companion folder and run the Resume command shown beside that source in Connections.
3. For a second account, create another connection and pair it in another terminal. Afterword assigns separate profiles automatically.

- [Continuous capture and storage guide](./running.md)

<a id="profiles"></a>

## One profile for each source

Pairing assigns a unique profile such as telegram-a1b2c3d4. This keeps two accounts or sources from mixing local sessions or queued messages. Use the exact Resume command displayed in Connections.

```sh
npm start -- run telegram-a1b2c3d4
```

> Run only one process per profile. Each additional source needs a separate terminal or supervised process. The companion folder contains the program; your profile data lives outside it, so replacing the program folder does not erase your session.

<a id="always-on"></a>

## For continuous capture

For the simplest setup, leave a dedicated terminal open on a computer that stays awake. Your web browser does not need to stay open. For unattended operation, use an operating-system process supervisor after completing the first sign-in interactively.

- Linux: use a user systemd service with the absolute Node executable, companion/index.mjs run YOUR-PROFILE, a working directory pointing to the extracted folder, Restart=on-failure, RestartSec=10, and UMask=0077.
- macOS: use a LaunchAgent with the same executable, script, profile, working directory, and restricted file permissions. The companion does not install a LaunchAgent automatically.
- Windows: use Task Scheduler under your own user account with node.exe, the absolute script path, and run YOUR-PROFILE. Set the working directory to the extracted folder. Complete QR/sign-in first.

> This release does not ship a desktop tray app or automatic background-service installer. A supervisor restarts stopped processes; it cannot solve expired logins or scan QR codes for you.

<a id="updates"></a>

## Update without losing your history

1. Stop the companion using Ctrl+C.
2. Download the latest ZIP from a connection setup screen and extract it to a new folder.
3. Run npm ci --omit=dev in that folder, then use your existing profile’s Resume command.
4. For Signal, update signal-cli separately and confirm signal-cli --version works.

> Your cloud archive and profiles are separate from the downloaded program. Keep your profile files in place unless you intentionally want to unlink or remove local data.

<a id="storage"></a>

## Where local data lives

On macOS and Linux, profiles live under ~/.afterword/. On Windows, look inside .afterword in your user home folder. Each profile contains a restricted config.json, an encrypted retry queue, its local encryption key, and any platform session files.

- The local queue keeps captured events during an archive outage and removes acknowledged deliveries.
- Some local metadata is retained to correlate edits. Cloud retention does not automatically erase this local metadata.
- Protect your computer and backups: possession of the local queue and its key allows decryption.

- [Delete local and cloud data](./privacy.md#deletion)

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
