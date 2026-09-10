# Connect WhatsApp

Pair with a QR code from WhatsApp on your phone.

<a id="coverage"></a>

## What this connection covers

Captures ordinary messages, edits, and deletions delivered to your linked device. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt capture.

> No view-once or disappearing messages, past deleted content, or attachment file downloads.

<a id="before"></a>

## Before you start

- Your phone, signed in to WhatsApp
- An available linked-device slot
- A computer that can stay on while you capture
- Node.js 22.13 or newer on the computer running your companion

- [First time? Prepare your computer](./getting-started.md#computer)

<a id="platform-setup"></a>

## Prepare WhatsApp

1. Keep the companion terminal open until a QR code appears.
2. iPhone: open WhatsApp → Settings → Linked devices → Link a device. Android: open WhatsApp → ⋮ → Linked devices → Link a device.
3. Unlock your phone if asked, then scan the QR code shown on your computer.

- [WhatsApp: link a device](https://faq.whatsapp.com/1317564962315842/)
- [Baileys project](https://github.com/WhiskeySockets/Baileys)

<a id="pair"></a>

## Pair with your Afterword workspace

1. In Connections, choose Connect WhatsApp. Review the checklist, name your connection, and continue.
2. Download and extract the companion ZIP. Open a terminal in its folder, then copy the install and pairing commands from the setup screen.
3. Enter the short Afterword pairing code in the terminal. The companion selects the right platform automatically; finish the sign-in steps or scan the QR code it displays.

> You do not enter your platform password into the Afterword website. Platform credentials and sessions stay on the computer running your companion.

<a id="verify"></a>

## Check that your first message arrived

“Connected” means the platform session is running. A captured message confirms the full route to your archive works. The setup screen checks this automatically; allow up to 30 seconds for status updates.

1. In a covered conversation, send a harmless test message such as “Afterword connection test.” Wait for it to appear in the archive.
2. Edit that message. Open its history in Afterword and check that both versions are present.
3. Delete it in the original app. If the platform delivers the deletion event, Afterword will show Deleted while preserving the captured text.

> Test with your own messages in conversations you are authorized to archive. Afterword does not send a test message for you.

<a id="fixes"></a>

## If WhatsApp does not connect

- QR not visible: keep the terminal wide enough and wait for the companion to finish connecting. If it expires, use the refreshed code.
- QR scan fails: use WhatsApp’s Linked devices scanner on your primary phone. Make sure both devices have internet access.
- Logged out or device removed: stop the companion and follow the relinking guide. Repeated failures after an update may need a newer Baileys/companion release.

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
