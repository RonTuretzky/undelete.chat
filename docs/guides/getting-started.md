# Start keeping deleted messages

Connect your accounts without installing anything on your computer. Undelete keeps only the messages that are later deleted.

<a id="account"></a>

## Create your workspace

1. Choose Create your archive. Use a username and a unique password of at least 12 characters.
2. Enter the invitation code if your Undelete instance requires one.
3. Open Connections and choose an account. WhatsApp, Telegram, and Signal use hosted phone linking. Discord offers an explicitly experimental personal cloud connection when the operator enables it, plus an optional browser extension.

> The signed-out preview contains sample deleted messages. Your own archive starts empty and stays empty until a message you are watching is deleted. Save the one-time recovery key shown after registration in your password manager. Use Forgot your password? on the sign-in screen to reset your password with that key.

<a id="pair"></a>

## Scan once, watch in the cloud

Hosted setup needs no downloads, extension, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen.

1. Read the platform’s coverage and authorize Undelete to host your linked session.
2. Open the phone’s linking screen: Linked devices for WhatsApp/Signal, Devices for Telegram, or Scan QR Code in Discord Settings. Scan the code shown in Undelete.
3. Complete any requested password or phone approval. Keep the setup page open until it shows Connected.

<a id="verify"></a>

## Verify your first deleted message

Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into Undelete. The connection screen separately checks whether a deleted message has reached your archive.

1. Send a harmless message in your own chat. It does not appear in Undelete yet.
2. Optionally edit it once or twice. Edits alone do not keep a message.
3. Delete it for everyone in the original app, then confirm it appears in Undelete marked Deleted, with each edit it had before deletion.

> Undelete never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered.

<a id="history"></a>

## Read a deleted message and its edits

1. Open a deleted message in your archive. Timeline shows the events received before the deletion, newest first; each saved text revision has a version number.
2. Choose Compare changes to see additions and removals between consecutive versions. Very long or substantially different revisions show both complete texts instead.
3. For longer histories, use Older, Newer, or the page number. First captured activity jumps to the beginning; Latest activity returns to the most recent page.
4. If another event arrives while you read, choose Refresh history when you are ready. Your current page stays in place until then.

> A page contains up to 30 events, including the deletion. Version comparisons continue across page boundaries. Export includes every stored version of every deleted message, regardless of the page you are viewing.

<a id="keep-running"></a>

## The watch continues in the cloud

Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.

A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous watching and recovery](./running.md)

<a id="discord"></a>

## Discord availability

Discord offers an experimental personal cloud connection when the operator enables it. It can run while your computer is off, but Discord forbids automated personal accounts and may terminate them. Read its account-risk notice before linking. The optional browser extension still requires an open Discord Web tab.

- [Discord coverage and setup](./discord.md)

<a id="controls"></a>

## Manage what stays

Settings lets you choose the watch window (1, 3, 7, or 30 days; 7 days by default), how long preserved deleted messages are retained, and export your archive. A message that is not deleted within its watch window is discarded and cannot be recovered later. Pause stops storing new events while the cloud session stays connected. Disconnect removes the saved cloud login and stops the watch; your archive remains until you delete it. Account deletion removes the archive, the messages waiting in the watch window, and stored sessions.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
