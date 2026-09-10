# Connect personal Discord in the cloud

Phone-approved, experimental access to your own DMs. Understand Discord’s account restrictions before linking.

<a id="access"></a>

## Understand the account risk

Discord does not offer a supported general-purpose cloud API for archiving a personal account’s DMs. This connector uses an unofficial personal session. Discord forbids automated personal accounts and can terminate accounts that use them.

The operator must enable this experiment. It is not an approved Discord integration, and phone approval does not make it compliant with Discord’s rules. Do not rely on uninterrupted access or a production service guarantee.

- [Read Discord’s policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots)

<a id="platform-setup"></a>

## Have your phone ready

No browser extension, bot token, developer application, or terminal is required for the cloud experiment. The account session is created only after you approve it on your phone.

- Your phone, signed in to your own Discord account
- Acceptance of the account risk before starting this unofficial connection

<a id="connect"></a>

## Link your own account

1. In Afterword, choose Connections → Discord. Read the account-risk notice, name the source, and acknowledge both consent boxes.
2. On your phone, open Discord → your profile → Settings → Scan QR Code. Scan the code generated in your signed-in Afterword workspace.
3. Review the phone approval screen and approve the login only if you intend to give Afterword a personal session on its server. Wait for Connected, then verify a harmless DM in your archive.

> Approving this QR signs your personal account into Afterword’s server. Generate the code yourself inside your signed-in workspace and keep it private.

- [Discord: phone QR login](https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ)

<a id="verify"></a>

## Verify capture before relying on it

1. Wait until the platform connection reports Connected.
2. Send a harmless DM to a person who has agreed to help test, or use an existing conversation you are authorized to archive.
3. Check that the original appears in Afterword. Edit and delete the test message in Discord, then inspect the captured history.
4. Close the Afterword website and your computer. The hosted collector continues while its server and Discord session remain available.

> Only messages actually received while capture is active can be retained. Live account linking and message capture remain required to validate this experimental connector.

<a id="privacy"></a>

## What the server stores

The approved personal session is stored encrypted in the source’s private queue. It is never returned by the Afterword API or placed in application logs. The server holds the decryption key.

Only allowlisted fields from identified DMs/group DMs enter the archive. The connector does not send Discord messages, mark them read, download attachments, or retain server-channel messages. Temporary message metadata used for partial edits expires after seven days.

Pause drops new activity while keeping the session connected. Disconnect stops capture and deletes the saved session from active storage; existing archived messages remain. Use Discord’s device/session controls to revoke its login as well. Restricted backups can retain older encrypted copies until rotation.

<a id="fixes"></a>

## When linking or capture stops

Expired code: request a fresh one from Afterword and approve it before it expires.

Additional verification or CAPTCHA: this connector stops. Complete account checks in the official Discord app; it does not solve or bypass verification challenges.

Session revoked: choose Relink, review the warning again, and approve the intended account. The original source is bound to one Discord account; use another source for a different account.

Repeated protocol failures or account restrictions require operator attention. Do not repeatedly retry a rejected login.

<a id="browser"></a>

## Optional browser extension

If cloud access is disabled or you choose the browser option during setup, the existing experimental extension can observe a selected Discord Web tab. It requires Chrome and that tab to stay open.

- [Browser extension instructions](./discord-extension.md)

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
