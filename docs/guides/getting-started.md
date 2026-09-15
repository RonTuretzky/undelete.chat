# Start keeping deleted messages

Connect your accounts without installing anything on your computer. undelete.chat keeps only the messages that are later deleted.

<a id="account"></a>

## Create your workspace

1. Choose Start free. Use a username and a password of at least 8 characters. No email address is needed.
2. Open Connections and choose an account. WhatsApp, Telegram, and Signal use hosted phone linking.

> The signed-out preview contains sample deleted messages. Your own archive starts empty and stays empty until a message you are watching is deleted or set to disappear. Your device creates an archive key that only you hold; the server seals every recovered message to it and cannot read them. Your password unlocks the key on each device, and the one-time recovery key shown after registration unlocks it if you forget the password. Save that key in your password manager: if you lose both, nobody can recover your archive.

<a id="phone"></a>

## Install it on your phone

1. Android: open undelete.chat in Chrome, open the menu, and choose Install app. It appears on your home screen like any other app.
2. iPhone or iPad: open undelete.chat in Safari, tap Share, then Add to Home Screen. Notifications need iOS 16.4 or later and only work from the installed app.
3. Open Settings → Phone app and choose Turn on notifications to hear when a deleted message is recovered. Notifications never include the message itself.

> The installed app is the same service; signing in on the phone shows the same archive as the website.

<a id="pair"></a>

## Scan once, watch in the cloud

Hosted setup needs no downloads, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen.

1. Read the platform’s coverage and authorize undelete.chat to host your linked session.
2. Open the phone’s linking screen: Linked devices for WhatsApp/Signal, or Devices for Telegram. Scan the code shown in undelete.chat.
3. Complete any requested password or phone approval. Keep the setup page open until it shows Connected.

<a id="verify"></a>

## Verify your first deleted message

Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive.

1. Send a harmless message in your own chat. It does not appear in undelete.chat yet.
2. Optionally edit it once or twice. Edits alone do not keep a message.
3. Delete it for everyone in the original app, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion.

> undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered.

<a id="history"></a>

## Read a deleted message and its edits

1. Open a deleted message in your archive. Timeline shows the events received before the deletion, newest first; each saved text revision has a version number.
2. Choose Compare changes to see additions and removals between consecutive versions. Very long or substantially different revisions show both complete texts instead.
3. For longer histories, use Older, Newer, or the page number. First captured activity jumps to the beginning; Latest activity returns to the most recent page.
4. If another event arrives while you read, choose Refresh history when you are ready. Your current page stays in place until then.

> A page contains up to 30 events, including the deletion. Version comparisons continue across page boundaries. Export includes every stored version of every deleted message, regardless of the page you are viewing.

<a id="keep-running"></a>

## The watch continues in the cloud

Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.

A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous watching and recovery](./running.md)

<a id="controls"></a>

## Manage what stays

Settings lets you set a watch window per platform for edits and for deletions (defaults: WhatsApp 1 hour and 3 days, Signal 2 days and 2 days, Telegram 3 days and 30 days, each the platform's own limit plus a margin), how long preserved deleted messages are retained, and export your archive. A message that is not deleted within its watch window is discarded and cannot be recovered later. Pause stops storing new events while the cloud session stays connected. Disconnect removes the saved cloud login and stops the watch; your archive remains until you delete it. Account deletion removes the archive, the messages waiting in the watch window, and stored sessions.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
