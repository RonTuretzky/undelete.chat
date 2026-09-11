# Privacy policy

What Undelete stores, why, for how long, and who can see it.

<a id="summary"></a>

## In short

Undelete watches the personal messaging accounts you link and keeps only messages that were later deleted on the platform. Every other message is held privately for your watch window (7 days by default, adjustable in Settings between 1 and 30 days) and then discarded. Nothing you did not link is watched, and nothing that was never deleted is kept beyond that window.

Message content is encrypted at rest with a key held by the server. The server can decrypt your messages to show them to you; this is not end-to-end encryption, and the people who operate the server could technically read stored content. We do not sell, share, analyse, or use message content for anything other than showing it to you.

This policy was last updated on September 11, 2026. It applies to the hosted service at undelete.chat.

<a id="collected"></a>

## What we store

Account: a username you choose, a salted scrypt hash of your password, a hash of your recovery key, your retention and watch-window settings, and the date you registered. We do not require an email address or phone number to create an account.

Sessions: a hash of each browser session token with its expiry. The only cookie is the session cookie; there are no analytics, advertising, or tracking cookies, and no third-party scripts run in the app.

Connections: the platform, the name you gave each linked account, its status, and timestamps. For hosted connections, the platform login session your phone approved (for example a WhatsApp or Signal linked-device session, or a Telegram session) is stored encrypted so the connection keeps running while your computer is off. Each connection has its own encryption key derived from the server key; workers never see other users’ sessions.

Messages: for each watched message, the text, sender name, conversation name, platform identifiers, timestamps, and attachment names and types. File bodies, images, voice notes, and disappearing or view-once content are never stored. Reactions, link previews, pins, and formatting-only changes are not recorded. Held messages that are not deleted within your watch window are removed automatically. Deleted messages are kept with every edit they had before deletion until you remove them or your retention period ends.

Deletion markers: when you permanently remove a message from Undelete, a hashed marker is kept so a delayed delivery of the same message cannot bring it back. The marker contains no content.

Billing: if you subscribe, Stripe’s customer and subscription identifiers, the subscription status, and the current period end. Card numbers and billing addresses are entered on Stripe’s pages and never reach our server.

Support and operations: the server logs record only error codes, service status, and backup results. They do not record message content, usernames, IP addresses, or request paths. The reverse proxy does not keep an access log.

<a id="retention"></a>

## How long we keep it

Held messages: until the end of your watch window, measured from the last activity on that message.

Deleted messages: until you remove them, delete your account, or your retention setting expires them (7 days to 1 year, or until you delete them).

Platform sessions: until you disconnect the connection or delete your account. Disconnecting removes the stored session; relinking requires a fresh approval on your phone.

Sessions: browser sessions expire after 30 days and end when you sign out or change your password.

Backups: encrypted application snapshots of the database are taken daily and kept for seven days on the server. The hosting provider also keeps daily full-server images for seven days; those images include the server’s decryption keys and are protected by the provider’s access controls rather than by a separate key. Data you delete can therefore persist in backups for up to seven days.

Account deletion: removes your messages, events, connections, stored platform sessions, billing links, and sessions immediately, cancels any hosted collector, and cancels your subscription. Backups age out within seven days.

<a id="processors"></a>

## Who else handles your data

DigitalOcean (New York data centre) hosts the server, its disk, daily server images, and the external availability check that requests the public status endpoint. DigitalOcean can access the physical infrastructure under its own privacy policy.

Stripe processes payments and holds your card details and billing address. We receive only identifiers and subscription status. Stripe’s privacy policy applies to the checkout and billing portal pages.

Cloudflare provides DNS for undelete.chat only. Traffic to the site does not pass through Cloudflare’s proxy.

The messaging platforms you link (Telegram, WhatsApp, Signal, Discord) see a linked device or session named Undelete on your account, exactly as they would for a desktop client. We do not send them anything beyond what their protocols require to receive your messages.

No other third party receives data. We do not use analytics, error-tracking, email, or advertising services.

<a id="security"></a>

## How it is protected

All traffic uses HTTPS with HSTS. Message content and platform sessions are encrypted with AES-256-GCM, bound to the owning account so records cannot be moved between accounts. Passwords use salted scrypt and are never stored in clear text. Session and connection tokens are stored only as SHA-256 digests.

The application runs as an unprivileged user in a read-only container with all Linux capabilities dropped. Each hosted collector is a separate process that receives only its own connection’s derived key. Administrative access to the server is limited to the operator’s SSH key.

The server key that decrypts the archive is kept outside the database and outside backups of the application. Off-server backups, when enabled, are encrypted before upload with a key derived from it.

No system is perfectly secure. If we learn of a breach affecting your data we will tell you through the app and, where we have it, your contact address, as soon as reasonably possible.

<a id="rights"></a>

## Your choices and rights

You can export everything Undelete holds for you as JSON from Settings at any time, remove individual messages, disconnect any account, shorten or lengthen the watch window and retention period, and delete your account outright. None of these actions requires contacting us.

Depending on where you live, you may have legal rights to access, correct, delete, restrict, or port your personal data, or to object to its processing. The controls above are how we honour those rights; if they are not enough, contact us at the address in the terms of service and we will respond within 30 days.

The messages you capture include other people’s words. You are responsible for having a lawful basis to keep them, and for not using Undelete to monitor someone without their knowledge where that is unlawful.

Undelete is not intended for children under 16 and we do not knowingly create accounts for them.

<a id="changes"></a>

## Changes to this policy

When we change what we store or who processes it, we update this page and announce material changes in the app before they take effect. The date at the top shows the current version.

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
