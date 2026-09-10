# Connect Signal in the cloud

Link Signal from your phone; no desktop installation is needed.

<a id="coverage"></a>

## What gets captured

Captures ordinary incoming messages, synced outgoing messages, edits, and remote deletion events received by the linked device. signal-cli is unofficial and must stay current.

> No disappearing or view-once messages, existing Signal Desktop database import, or attachment file downloads.

<a id="before"></a>

## Have your phone ready

Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running.

- Your phone, signed in to Signal
- An available linked-device slot

<a id="platform-setup"></a>

## Link your account

1. In Afterword, choose Connections → Signal, name the account, and authorize hosted capture.
2. On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).
3. Scan the QR code shown in Afterword and approve the device named Afterword Cloud. Wait for Connected.

> The QR code links your account to a server operated by Afterword. Keep it private and use the scanner inside the messaging app.

- [Signal: linked devices](https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices)

<a id="verify"></a>

## Verify your first captured message

Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive.

1. Send a harmless message in your own chat and check that it appears in Afterword.
2. Edit that message and open its Afterword history to look for both versions.
3. Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received.

> Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion.

<a id="keep-running"></a>

## Capture continues in the cloud

Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.

A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous capture and recovery](./running.md)

<a id="fixes"></a>

## If linking needs attention

- If the QR code expires, choose Get a fresh code or Try again. WhatsApp and Telegram refresh their codes automatically during setup.
- If your phone rejects the link, check that you are scanning with the matching app and have an available device slot.
- If the platform unlinked your device, open Connection check → Connection options → Relink account, then approve a new code. This clears the old platform login for that source and keeps the archive.
- A cloud capacity or configuration message means the operator must resolve it. Repeated scanning will not fix that condition.

<a id="privacy"></a>

## Where your data lives

Afterword stores the linked session on its server so capture can continue while your devices are off. Stored credentials and captured message bodies are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
