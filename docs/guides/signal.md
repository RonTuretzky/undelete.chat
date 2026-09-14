# Connect Signal in the cloud

Link Signal from your phone; no desktop installation is needed.

<a id="coverage"></a>

## What gets kept

Watches ordinary incoming messages, synced outgoing messages, and their edits received by the linked device, and keeps only the ones removed by a remote delete. signal-cli is unofficial and must stay current.

Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept.

> No view-once media, existing Signal Desktop database import, messages that outlive the watch window, or attachment file downloads.

<a id="before"></a>

## Have your phone ready

Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running.

- Your phone, signed in to Signal
- An available linked-device slot

<a id="platform-setup"></a>

## Link your account

1. In undelete.chat, choose Connections → Signal, name the account, and authorize the hosted connection.
2. On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).
3. Scan the QR code shown in undelete.chat and approve the device named undelete.chat Cloud. Wait for Connected.

> The QR code links your account to a server operated by undelete.chat. Keep it private and use the scanner inside the messaging app.

- [Signal: linked devices](https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices)

<a id="verify"></a>

## Verify your first deleted message

Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive.

1. Send a harmless message in your own chat. It does not appear in undelete.chat yet.
2. Optionally edit it once or twice. Edits alone do not keep a message.
3. Delete it for everyone in Signal, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion.

> undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered.

<a id="keep-running"></a>

## The watch continues in the cloud

Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.

A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous watching and recovery](./running.md)

<a id="fixes"></a>

## If linking needs attention

- If the QR code expires, choose Get a fresh code or Try again. WhatsApp and Telegram refresh their codes automatically during setup.
- If your phone rejects the link, check that you are scanning with the matching app and have an available device slot.
- If the platform unlinked your device, open Connection check → Connection options → Relink account, then approve a new code. This clears the old platform login for that source and keeps the archive.
- A cloud capacity or configuration message means the operator must resolve it. Repeated scanning will not fix that condition.

<a id="privacy"></a>

## Where your data lives

undelete.chat stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
