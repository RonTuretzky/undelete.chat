# Connect Telegram in the cloud

Scan a Telegram QR code. undelete.chat keeps watching on its server.

<a id="coverage"></a>

## What gets kept

Watches ordinary cloud-chat messages and their edits, and keeps only the ones Telegram later reports as deleted. Telegram sometimes omits deletion notifications, so some deleted messages are missed.

Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept.

> No secret chats, self-destructing media, historical backfill, messages that outlive the watch window, or attachment file downloads.

<a id="before"></a>

## Have your phone ready

Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running.

- Your phone, signed in to Telegram
- Your two-step verification password, if enabled

<a id="platform-setup"></a>

## Link your account

1. In undelete.chat, choose Connections → Telegram, name the account, and authorize the hosted connection.
2. On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in undelete.chat.
3. If prompted, enter your Telegram two-step verification password in undelete.chat. Wait for Connected.

> undelete.chat’s operator configures the Telegram application credentials. You do not need to create your own Telegram developer application. Your sign-in password is used for the current step and is not stored in application logs.

- [Telegram: application setup](https://core.telegram.org/api/obtaining_api_id)
- [Telegram API terms](https://core.telegram.org/api/terms)

<a id="verify"></a>

## Verify your first deleted message

Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive.

1. Send a harmless message in your own chat. It does not appear in undelete.chat yet.
2. Optionally edit it once or twice. Edits alone do not keep a message.
3. Delete it for everyone in Telegram, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion.

> undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion Telegram never delivered.

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
