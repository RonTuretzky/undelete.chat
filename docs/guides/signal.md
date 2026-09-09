# Connect Signal

Link your phone through the signal-cli companion on your computer.

<a id="coverage"></a>

## What this connection covers

Captures ordinary incoming messages, synced outgoing messages, edits, and remote deletion events received by the linked device. signal-cli is unofficial and must stay current.

> No disappearing or view-once messages, existing Signal Desktop database import, or attachment file downloads.

<a id="before"></a>

## Before you start

- Your phone, signed in to Signal
- signal-cli installed and available in your terminal
- An available linked-device slot
- Node.js 22.13 or newer on the computer running your companion

- [First time? Prepare your computer](./getting-started.md#computer)

<a id="platform-setup"></a>

## Prepare Signal

1. Install signal-cli before pairing. On macOS with Homebrew, run brew install signal-cli. For Windows and Linux, follow the signal-cli installation guide for your operating system and its Java/runtime requirements.
2. Run signal-cli --version to confirm the terminal can find it. Then start the Afterword companion and wait for its QR code.
3. On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device. Unlock if asked, scan the QR code, and approve the link.

- [Install signal-cli](https://github.com/AsamK/signal-cli#installation)
- [Homebrew: signal-cli](https://formulae.brew.sh/formula/signal-cli)
- [Signal: linked devices](https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices)

<a id="pair"></a>

## Pair with your Afterword workspace

1. In Connections, choose Connect Signal. Review the checklist, name your connection, and continue.
2. Download and extract the companion ZIP. Open a terminal in its folder, then copy the install and pairing commands from the setup screen.
3. Enter the short Afterword pairing code in the terminal. The companion selects the right platform automatically; finish the sign-in steps or scan the QR code it displays.

> You do not enter your platform password or bot token into the Afterword website. Platform credentials and sessions stay on the computer running your companion.

<a id="verify"></a>

## Check that your first message arrived

“Connected” means the platform session is running. A captured message confirms the full route to your archive works. The setup screen checks this automatically; allow up to 30 seconds for status updates.

1. In a covered conversation, send a harmless test message such as “Afterword connection test.” Wait for it to appear in the archive.
2. Edit that message. Open its history in Afterword and check that both versions are present.
3. Delete it in the original app. If the platform delivers the deletion event, Afterword will show Deleted while preserving the captured text.

> Test with your own messages in conversations you are authorized to archive. Afterword does not send a test message for you.

<a id="fixes"></a>

## If Signal does not connect

- signal-cli not found: install it, reopen the terminal, and confirm signal-cli --version works. Installing Signal Desktop alone does not install signal-cli.
- QR expires: restart the companion and use the new QR code. Scan using Linked devices on your primary phone, not the camera app.
- Device limit or revoked session: remove an unused device in Signal, then follow the relinking guide. Update signal-cli when Signal changes its protocol.

- [Connection states, retries, and relinking](./troubleshooting.md)

<a id="keep-running"></a>

## Keep capture running

Leave the companion terminal open and keep the computer awake and connected to the internet. Closing it, sleeping, or unlinking the device interrupts capture. Messages that change during a gap may never be recoverable.

1. To stop, press Ctrl+C in the companion terminal.
2. To resume, reopen a terminal in the companion folder and run the Resume command shown beside that source in Connections.
3. For a second account, create another connection and pair it in another terminal. Afterword assigns separate profiles automatically.

- [Continuous capture and storage guide](./running.md)

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
