# Start your cloud archive

Connect your accounts without installing anything on your computer.

<a id="account"></a>

## Create your workspace

1. Choose Create your archive. Use a username and a unique password of at least 12 characters.
2. Enter the invitation code if your Afterword instance requires one.
3. Open Connections and choose an account. WhatsApp, Telegram, and Signal use hosted phone linking. Discord offers an explicitly experimental personal cloud connection when the operator enables it, plus an optional browser extension.

> The signed-out preview contains sample messages. Your own archive starts empty. Save the one-time recovery key shown after registration in your password manager. Use Forgot your password? on the sign-in screen to reset your password with that key.

<a id="pair"></a>

## Scan once, capture in the cloud

Hosted setup needs no downloads, extension, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen.

1. Read the platform’s coverage and authorize Afterword to host your linked session.
2. Open the phone’s linking screen: Linked devices for WhatsApp/Signal, Devices for Telegram, or Scan QR Code in Discord Settings. Scan the code shown in Afterword.
3. Complete any requested password or phone approval. Keep the setup page open until it shows Connected.

<a id="verify"></a>

## Verify your first captured message

Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive.

1. Send a harmless message in your own chat and check that it appears in Afterword.
2. Edit that message and open its Afterword history to look for both versions.
3. Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received.

> Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion.

<a id="history"></a>

## Read edits and deleted messages

1. Open a message in your archive. Timeline shows the captured events, newest first; each saved text revision has a version number.
2. Choose Compare changes to see additions and removals between consecutive captured versions. Very long or substantially different revisions show both complete texts instead.
3. For longer histories, use Older, Newer, or the page number. First captured activity jumps to the beginning; Latest activity returns to the most recent page.
4. If another event arrives while you read, choose Refresh history when you are ready. Your current page stays in place until then.

> A page contains up to 30 events, including deletions. Version comparisons continue across page boundaries. Export includes every stored version, regardless of the page you are viewing.

<a id="keep-running"></a>

## Capture continues in the cloud

Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.

A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous capture and recovery](./running.md)

<a id="discord"></a>

## Discord availability

Discord offers an experimental personal cloud connection when the operator enables it. It can run while your computer is off, but Discord forbids automated personal accounts and may terminate them. Read its account-risk notice before linking. The optional browser extension still requires an open Discord Web tab.

- [Discord coverage and setup](./discord.md)

<a id="controls"></a>

## Manage what stays

Settings lets you choose retention and export your archive. Pause stops storing new events while the cloud session stays connected. Disconnect removes the saved cloud login and stops capture; your archive remains until you delete it. Account deletion removes the archive and stored sessions.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
