# Get a connection back on track

Find the status you see, then take the next step.

<a id="states"></a>

## Understand connection status

- Ready to pair: a source exists, but the companion has not paired. Choose Continue setup.
- Finish sign-in: the companion paired with Afterword; complete the platform login or QR scan in the terminal.
- Capturing messages: the platform session reports connected and the companion checked in recently. Send a test message to verify delivery.
- Companion offline: Afterword has not heard from the companion for 90 seconds. Check the computer and run the Resume command.
- Reconnecting: keep the process open while it retries the platform connection.
- Paused: new events reaching the archive are discarded. Resume to capture new activity; paused events are not recovered afterward.
- Needs attention: read the terminal and the platform guide. A rejected event remains in the local queue for diagnosis.

> A green connection status proves the session is running, not that every platform event is guaranteed to arrive.

<a id="pairing"></a>

## Pairing code expired, used, or lost

1. Open Connections → Continue setup for the same source. You do not need to create another source.
2. Generate a new pairing code. The old unused code stops working.
3. Run the pairing command again and enter the new code. Redemption replaces that source’s previous companion key, so stop its old companion first.

> A code is valid for ten minutes and one redemption. After repeated incorrect attempts, wait 15 minutes before trying again. If pairing succeeded but the terminal lost the response, generate another code; do not share screenshots containing codes.

<a id="terminal"></a>

## Terminal and installation errors

- “node” or “npm” not found: install Node.js LTS, then reopen the terminal.
- PowerShell refuses npm.ps1: run npm.cmd ci --omit=dev and npm.cmd start -- … instead. Keep the rest of each command the same.
- “package.json not found”: move into the extracted afterword-companion folder before running the command.
- “Unsupported engine”: update Node.js to 22.13 or newer.
- Download or dependency install failed: check internet/proxy access and rerun npm ci --omit=dev. Do not run the companion as administrator just to work around permissions.
- Certificate/network error: confirm the server address opens over HTTPS in a browser. Do not disable TLS certificate checks.

<a id="credentials"></a>

## Replace Telegram application credentials

Use this when the companion saved a mistyped Telegram API ID/hash. It updates only the platform credentials for the chosen profile; your queue, archive connection, and message history stay intact.

```sh
npm start -- credentials YOUR-PROFILE
npm start -- run YOUR-PROFILE
```

> Get the exact profile name from the source’s Resume instructions. Phone codes and two-step passwords are requested only when the platform needs them; they are not saved as configuration.

<a id="relink"></a>

## A platform unlinked your device

Archive pairing and platform linking are separate. A new Afterword code cannot repair a WhatsApp or Signal device session the platform revoked. First stop the companion with Ctrl+C.

1. Open the linked-device/session list in the platform app and remove the old companion session if it is still listed.
2. Use the Relink command below with the exact profile shown in Connections. It clears only the selected platform session after you type RELINK; it preserves the archive key and queued events.
3. Resume that profile and complete the fresh QR scan or Telegram sign-in. No new Afterword source is required.

```sh
npm start -- relink YOUR-PROFILE
npm start -- run YOUR-PROFILE
```

> Relinking cannot restore edits or deletions missed while the collector was disconnected.

<a id="missing"></a>

## Connected, but a message is missing

- Confirm you are viewing your signed-in archive, not sample data, and clear search/platform filters.
- Use a new ordinary text message in a covered conversation. Content from before capture started is not backfilled.
- Check that the computer stayed awake, that the source is not paused, and that the terminal reports no errors.
- Signal/WhatsApp disappearing or view-once messages and Telegram secret/self-destructing messages are excluded. Personal Discord capture is not available in this release.
- If the archive server was down, received events stay queued locally and upload after it recovers. Activity never delivered to the companion is not in that queue.
- Telegram may omit deletion events. Attachment filenames can appear without downloadable files because this release stores metadata only.

<a id="support"></a>

## What to include in a support report

- Platform, operating system, Node.js version, and the status shown in Connections.
- Whether the issue is pairing, platform sign-in, or capturing a new test message.
- A short description of the error with private information removed.

> Never include a bot token, pairing code, API hash, session file, queue key, or private conversation text. Contact the operator of your Afterword instance; this release does not have an in-app support inbox.

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
