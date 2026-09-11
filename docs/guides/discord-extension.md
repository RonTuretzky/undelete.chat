# Use the optional Discord browser extension

Watch DMs and group DMs delivered to your own Discord Web tab and keep the ones that get deleted.

<a id="coverage"></a>

## Your deleted DMs, in your own account

The experimental Undelete extension observes personal DM messages, edits, and deletions received by your signed-in Discord Web tab. Only messages that are later deleted are kept. It excludes server channels. Chrome and that tab must remain open.

This is a passive browser collector. You sign into Discord normally; Undelete does not request your Discord password or token, install a server bot, send messages, or open another Discord API session.

The extension uploads what it observes to your archive, where each message waits privately in the encrypted holding buffer for your watch window. A message Discord never deletes is discarded at the end of that window. A deleted one is kept with the edits received before the deletion.

> Only identified DMs and group DMs delivered after the watch starts and deleted within the watch window. No server channels, native-app capture, historical recovery, ephemeral interactions, or attachment file downloads. This unofficial beta may break or conflict with Discord policies; live account verification is still required.

<a id="before"></a>

## Before you start

- Chrome 125 or newer on a computer
- Your own account signed in to Discord Web
- Permission to load the extension and observe your chosen tab

> The extension is a downloadable beta, not a Chrome Web Store release. Chrome shows a broad debugging-permission notice: the implementation attaches only to the Discord tab you select and reads incoming Gateway frames. It ignores outgoing frames, HTTP bodies, cookies, and headers. Observed messages upload to your chosen Undelete archive.

<a id="platform-setup"></a>

## Install and pair the extension

1. In Connections, choose Connect Discord, name the source, and continue.
2. Download and extract the Undelete Discord extension ZIP.
3. Open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted afterword-discord-extension folder.
4. Open the Undelete extension, enter your archive address and pairing code, and allow access to that archive.
5. Choose your signed-in Discord tab and click Start capturing DMs. The tab reloads once, so send or clear drafts first. Keep Chrome’s debugging notice active.

> No Node.js, terminal, bot token, server selection, or developer application is needed. Keep the extracted extension folder: Chrome loads the extension from that location. Treat the Undelete pairing code as private.

- [Open Discord Web](https://discord.com/channels/@me)
- [Chrome: load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
- [Discord platform terms](https://discord.com/terms)

<a id="verify"></a>

## Check that your first deleted message arrived

“Connected” means the platform session is running. A deleted message in your archive confirms the full route works. New messages wait privately in the watch window and are not shown until they are deleted. The setup screen checks this automatically; allow up to 30 seconds for status updates.

1. In a covered conversation, send a harmless test message such as “Undelete connection test.” It does not appear in the archive yet.
2. Optionally edit that message. Edits alone do not keep it.
3. Delete it in Discord. Confirm it appears in Undelete marked Deleted, with each edit it had before deletion.

> Test with your own messages in conversations you are authorized to archive. Undelete does not send or delete a test message for you.

<a id="keep-running"></a>

## Keep Discord Web open

Keep Chrome running with your selected Discord Web tab open and signed in. Background tabs can receive events, but browser suspension, sleep, network gaps, and canceled debugging can interrupt the watch, and a deletion that arrives during a gap is missed.

After restarting Chrome or updating the extension, open it and click Start capturing DMs again. Starting reloads the tab once so the collector sees the new Discord connection.

- Stop capturing detaches from the tab while queued events can still upload.
- Pausing the source in Undelete discards incoming activity, matching other sources. Resume does not recover paused events.
- Use a separate Undelete source and Chrome profile for a different Discord account. A detected account switch stops the watch to prevent mixing archives.

<a id="storage"></a>

## Local copies and your archive

The extension keeps its archive key, DM metadata, and retry queue encrypted in its private IndexedDB storage. The encryption key lives in the same browser profile; this does not protect against someone who controls that profile or device.

Queued events survive a browser restart and are removed after the server acknowledges them. A queue limit stops the watch instead of silently dropping deliveries. Recent message metadata used to merge partial edits expires after seven days or on message deletion. Attachment metadata is stored; files are not downloaded.

The hosted archive uses the watch window and retention settings in your Undelete workspace. Disconnecting the extension clears its local connection and metadata once the queue is empty. Uninstalling it removes local extension storage; export any required data first.

<a id="fixes"></a>

## If deleted messages do not appear

- Finish ordinary Discord sign-in in the selected tab and click Start capturing DMs in the extension.
- Close DevTools for that Discord tab; another debugger can displace the watch. Restart if Chrome’s debugging notice was canceled.
- Check the extension status. Paired only confirms the archive link. Waiting for Discord is not a verified delivery.
- Only identified DMs and group DMs are watched, and only deleted ones are kept. A server message, a message from before the watch started, a message that was never deleted, or an event Discord never delivers will not appear.
- If archive access is down, events remain encrypted locally. Restore access before the queue reaches its 10,000-event limit.
- Unsupported encoding/compression or an account switch stops the watch visibly. Update the extension or create a separate account connection. Do not paste a Discord user token to work around an error.

- [Privacy and retention](./privacy.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
