# Personal Discord messages

Personal Discord messages are part of the intended product, but this connection is not available yet.

<a id="coverage"></a>

## Your personal conversations are the goal

Afterword is intended for individuals keeping a record of messages delivered to their own accounts, including personal DMs and group DMs.

Afterword does not currently capture your personal Discord DMs or group DMs. The earlier server-bot connection does not provide access to your personal inbox.

> Personal Discord capture is unavailable. You do not need a server, a bot token, or permission to install a bot.

<a id="access"></a>

## Why there is no Connect button yet

Ordinary Discord sign-in does not grant an app access to all of your message content. Discord documents messages.read for its local client RPC interface; RPC access is restricted to approved partners, with limited testing access.

Afterword has not obtained or verified that access. A personal connector must be implemented and tested for new messages, edits, and deletions before this page can offer account linking. A user-installed bot does not provide the missing inbox access.

- [Discord: OAuth2 scopes](https://docs.discord.com/developers/topics/oauth2)
- [Discord: local client RPC](https://docs.discord.com/developers/topics/rpc)

<a id="current-release"></a>

## What to expect in this release

- No Discord developer setup or server selection is required from you.
- No personal Discord session is connected, and no personal Discord messages are being archived.
- The server-bot setup path has been withdrawn. An old Discord source or sample message is not proof of personal-account support.
- Existing archived records remain available. Other personal-account connections can still be set up from their guides.

- [Connect your Telegram account](./telegram.md)
- [Link your Signal account](./signal.md)
- [Link your WhatsApp account](./whatsapp.md)

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
