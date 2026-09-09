# Connect Discord

Archive channels in a server where you can install a bot.

<a id="coverage"></a>

## What this connection covers

Captures messages, edits, and single or bulk deletions in bot-accessible channels, plus messages addressed to the bot. Personal DMs between users are not covered.

> No personal account sign-in or private DMs between other users. A bot must be allowed to view each channel; Administrator permission is unnecessary.

<a id="before"></a>

## Before you start

- Permission to install a bot in your server
- A bot token from the Discord Developer Portal
- Message Content Intent enabled for that bot
- Node.js 22.13 or newer on the computer running your companion

- [First time? Prepare your computer](./getting-started.md#computer)

<a id="platform-setup"></a>

## Prepare Discord

1. In the Discord Developer Portal, create an application. Open Bot and enable Message Content Intent under Privileged Gateway Intents; save your changes.
2. Under Installation, enable Guild Install. Choose the bot scope and only the View Channels and Read Message History permissions needed for the channels you want to archive. Use the install link to add the bot to your server.
3. Back on the Bot page, use Reset Token if needed to obtain the bot token. Paste it only into the companion terminal. If the bot is already in use elsewhere, resetting its token also disconnects those sessions.

- [Discord Developer Portal](https://discord.com/developers/applications)
- [Discord: bot setup](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord: self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

<a id="pair"></a>

## Pair with your Afterword workspace

1. In Connections, choose Connect Discord. Review the checklist, name your connection, and continue.
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

## If Discord does not connect

- Connected but no messages: confirm Message Content Intent is enabled and the bot can View Channel in the specific channel. Server permissions and channel overrides both matter.
- 401 or rejected token: obtain the current bot token in the Developer Portal. Use the companion’s credentials command to enter a replacement.
- No personal DMs appear: personal user DMs are outside this bot connection’s coverage. Installing the bot as a user app does not grant access to them.

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
