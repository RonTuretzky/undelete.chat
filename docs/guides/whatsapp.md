# Connect WhatsApp in the cloud

Link WhatsApp from your phone and keep the messages that get deleted.

<a id="coverage"></a>

## What gets kept

Watches ordinary messages and their edits delivered to your linked device, and keeps only the ones that are later deleted. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt the watch.

Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept.

> No view-once media, messages deleted before linking, messages that outlive the watch window, or attachment file downloads.

<a id="before"></a>

## Have your phone ready

Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running.

- Your phone, signed in to WhatsApp
- An available linked-device slot

<a id="platform-setup"></a>

## Link your account

1. In undelete.chat, choose Connections → WhatsApp, name the account, and authorize the hosted connection.
2. iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.
3. Unlock your phone if asked, scan the code shown in undelete.chat, and approve the link. Wait for Connected.

> The QR code links your account to a server operated by undelete.chat. Keep it private and use the scanner inside the messaging app.

- [WhatsApp: link a device](https://faq.whatsapp.com/1317564962315842/)
- [Baileys project](https://github.com/WhiskeySockets/Baileys)

<a id="verify"></a>

## Verify your first deleted message

Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive.

1. Send a harmless message in your own chat. It does not appear in undelete.chat yet.
2. Optionally edit it once or twice. Edits alone do not keep a message.
3. Delete it for everyone in WhatsApp, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion.

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

undelete.chat stores the linked session on its server so the watch can continue while your devices are off. Messages waiting in the watch window and recovered messages are sealed to an archive key that only you hold, so the server cannot read them once stored; your password unlocks them on each device. Two things stay readable to the server: the linked platform session it needs to keep your account connected, and each message for the instant it arrives, before it is sealed. That last step is what keeps this short of end-to-end encryption.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
