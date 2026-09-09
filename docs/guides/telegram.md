# Connect Telegram

Connect your own Telegram cloud chats with a phone sign-in.

<a id="coverage"></a>

## What this connection covers

Captures ordinary cloud-chat messages, revisions, and deletion events Telegram delivers. Telegram sometimes omits deletion notifications.

> No secret chats, self-destructing messages, historical backfill, or attachment file downloads.

<a id="before"></a>

## Before you start

- Your phone, signed in to Telegram
- Your Telegram application API ID and API hash
- Your two-step verification password, if enabled
- Node.js 22.13 or newer on the computer running your companion

- [First time? Prepare your computer](./getting-started.md#computer)

<a id="platform-setup"></a>

## Prepare Telegram

1. Open my.telegram.org/apps and sign in. Under API development tools, create an application or use your existing one. Keep its API ID and API hash ready.
2. Enter the API ID and API hash in the companion terminal, followed by your phone number with country code.
3. Enter the confirmation code Telegram sends. It may arrive in the Telegram app. If asked, enter your two-step verification password or email verification code.

- [Get your Telegram app credentials](https://my.telegram.org/apps)
- [Telegram: application setup](https://core.telegram.org/api/obtaining_api_id)
- [Telegram API terms](https://core.telegram.org/api/terms)

<a id="pair"></a>

## Pair with your Afterword workspace

1. In Connections, choose Connect Telegram. Review the checklist, name your connection, and continue.
2. Download and extract the companion ZIP. Open a terminal in its folder, then copy the install and pairing commands from the setup screen.
3. Enter the short Afterword pairing code in the terminal. The companion selects the right platform automatically; finish the sign-in steps or scan the QR code it displays.

> You do not enter your platform password or bot token into the Afterword website. Platform credentials and sessions stay on the computer running your companion.

<a id="verify"></a>

## Check that your first message arrived

“Connected” means the platform session is running. A captured message confirms the full route to your archive works. The setup screen checks this automatically; allow up to 30 seconds for status updates.

1. In a covered conversation, send a harmless test message such as “Afterword connection test.” Wait for it to appear in the archive.
2. Edit that message. Open its history in Afterword and check that both versions are present.
3. Delete it in the original app. If the platform delivers the deletion event, Afterword will show Deleted while preserving the captured text.

> Test with your own messages in conversations you are authorized to archive. Afterword does not send a test message for you.

<a id="fixes"></a>

## If Telegram does not connect

- API credentials rejected: the API ID is numeric and the API hash comes from API development tools; neither is a BotFather token.
- No confirmation code: check the Telegram service conversation on your phone. Do not repeatedly request codes; Telegram can impose a waiting period.
- Wrong saved app credentials: run the companion’s credentials command for that profile, then resume. If Telegram reports a revoked session, follow the relinking instructions in Troubleshooting.

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
