# Afterword operator handoff

This is the credential and access handoff for the hosted Afterword service. It describes where secrets live and how they are used. **Secret values are intentionally not included in this repository or in chat.** Transfer them through a password manager or an encrypted file exchange, then rotate credentials that have been exposed or shared with a previous operator.

## Service and source

| Item | Value |
| --- | --- |
| Private source repository | [github.com/RonTuretzky/afterword](https://github.com/RonTuretzky/afterword) |
| Branch | `main` |
| Last pushed release | `a57c92c` |
| Public service | [https://afterword-159-65-242-65.sslip.io](https://afterword-159-65-242-65.sslip.io) |
| DigitalOcean Droplet | `afterword-saas` (`159.65.242.65`, NYC3) |
| Private local store | `/Users/wk/.config/afterword` |

The GitHub repository is private. A signed-out browser can display a 404 until the operator signs in with an account that has repository access.

## Credentials required for normal operations

All paths below are on the current operator machine. On another machine, use that machine's home directory instead of `/Users/wk`.

| Credential | Private source | Used for | Required scope or handling |
| --- | --- | --- | --- |
| DigitalOcean personal access token | `~/.config/afterword/digitalocean.json`, field `token` | Provisioning, deployment status, Droplet backups, Uptime | Droplet read/action access, image/backup read access, and Uptime read/update access. Keep out of shell history and logs. |
| Deployment SSH private key | `~/.config/afterword/deploy_ed25519` | Root SSH used by deployment and operations scripts | Mode `0600`; the matching public key is `deploy_ed25519.pub`. `known_hosts` is pinned to the current host. |
| Archive encryption key | `~/.config/afterword/app-secrets.json`, field `archive_key` | Decrypting the SQLite archive, hosted queue sessions, application snapshots, and offsite replicas | 64 hexadecimal characters. Keep a separate password-manager copy. Losing it makes encrypted snapshots and hosted sessions unrecoverable. Never commit it. |
| Owner account | `~/.config/afterword/owner-credentials.txt`; source fields are `owner_username` and `owner_password` in `app-secrets.json` | Signing into the owner account and verifying the service | Change the password after handoff. Do not use this account for customer testing. |
| Invitation gate | `~/.config/afterword/invitation-code.txt`; source field `invite_code` in `app-secrets.json` | Allowing new registrations while the service is in private beta | Keep private. Removing the invitation requirement requires an explicit product decision and deployment change. |
| Telegram application credentials | `~/.config/afterword/hosted-config.json`, fields `telegram_api_id` and `telegram_api_hash` | Hosted Telegram sign-in and reconnect | The API hash is secret. These are application-level credentials, separate from each customer's phone sign-in. |
| GitHub write access | GitHub account or SSH/PAT credential in the operator's local credential manager | Pulling and pushing `origin` | The repository remote is HTTPS. The credential is not stored in the project. Use a GitHub account with access to `RonTuretzky/afterword`. |
| DigitalOcean web account and 2FA | DigitalOcean control panel | Billing, Spaces bucket/key creation, backup image restore, and account recovery | Not stored in this project. The account owner must complete 2FA when the control panel requests it. |

The generated `~/.config/afterword/app.env` is mode `0600` and contains the runtime archive key, invitation code, Telegram credentials, and capacity settings. It is an implementation artifact, not a replacement for the source secret files. The deployment script regenerates it privately from the source files before uploading it to `/opt/afterword/deploy/.env`.

## Platform account access

WhatsApp and Signal do not need a separate API key in this service. Each customer links their own account through the hosted HTTPS wizard and approves the device on their phone. The resulting sessions are encrypted in the per-connection queue; do not transfer phone PINs, QR contents, or session files between operators.

Discord has no supported bot credential for the personal-account flow. The optional cloud connector requires the account holder's live phone approval and explicit acknowledgement of Discord's personal-account automation restriction. It is experimental and must not be described as an approved Discord integration. Do not request, extract, or hand off a Discord password or token.

## Optional off-server backup credential

Off-server replication is implemented but is currently disabled for this deployment (`offsiteConfigured: false`). To activate it, create a private dedicated DigitalOcean Spaces bucket and a bucket-limited read/write Spaces key, then create this mode-`0600` file locally:

`~/.config/afterword/offsite-config.json`

```json
{
  "endpoint": "https://nyc3.digitaloceanspaces.com",
  "bucket": "YOUR-PRIVATE-BUCKET",
  "access_key": "YOUR-SPACES-ACCESS-KEY",
  "secret_key": "YOUR-SPACES-SECRET-KEY"
}
```

Run `python3 deploy/deploy.py` after creating the file. The server encrypts every snapshot object, verifies a readback, and records the destination in its private backup status. Follow [Encrypted off-server backups](OFFSITE-BACKUPS.md) for bucket setup, restore, and expiry rules. Do not reuse a bucket that contains another application's data. If the account has no existing Spaces subscription, the provider currently lists a $5/month base subscription.

## Commands for the next operator

Run these from the repository root:

```sh
python3 deploy/operations.py status
python3 deploy/operations.py service-status
python3 deploy/operations.py backup-status
python3 deploy/operations.py uptime-status
python3 deploy/deploy.py
git pull --ff-only origin main
git push origin main
```

The first four commands inspect state. `deploy.py` rebuilds and restarts the hosted service from the checked-out source and the private configuration. Review the diff and run `npm run check` before deploying source changes. Do not use `docker compose down -v`; it deletes the active archive volume. Do not start retired local collectors alongside the hosted service.

After deployment, verify `https://afterword-159-65-242-65.sslip.io/api/health` and `/api/monitor`. `/api/health` only proves that the web process can query SQLite. `/api/monitor` also checks local backup freshness, disk reserve, collector heartbeats, queue delivery age, and the configured offsite destination. A warning for `offsite_unconfigured` is expected until Spaces is activated.

## Credentials and files intentionally excluded from handoff

Do not copy these as working credentials:

- `retired-local-telegram-config.json` and `retired-local-whatsapp-config.json` contain old local collector tokens. The local collectors were stopped during hosted migration; revoke or destroy any still-valid tokens.
- `discord-ui-test.json`, `verify-cookies.txt`, QR images, and migration/proof files are test artifacts. They are not customer credentials and may contain temporary login material or private evidence.
- `/opt/afterword/deploy/.env` and the DigitalOcean full-server backup images contain the archive key and other runtime secrets. Treat access to them as full service access; do not put them in GitHub or a shared ticket.
- Hosted queue SQLite files contain encrypted platform sessions. They are not a substitute for re-linking a customer account and must not be opened on a second live collector.

## Rotation after handoff

1. Revoke and recreate the DigitalOcean token if it appeared in chat, tickets, shell history, or any machine that is not under the new operator's control. Update `digitalocean.json` and re-run the status check.
2. Replace the deployment SSH key in DigitalOcean and update `deploy_ed25519` plus `known_hosts` only after verifying the new host fingerprint.
3. Change the owner password and generate a new recovery key from Settings. Keep the new recovery key outside the repository.
4. Rotate Telegram application credentials through Telegram's official developer controls if they were shared outside the operator team. Update `hosted-config.json` and deploy.
5. Rotate any old local Telegram/WhatsApp tokens and remove retired local credentials from operator machines.
6. If Spaces is activated, rotate its bucket key independently of the DigitalOcean API token. Keep the archive key stable during ordinary credential rotation; changing it requires a planned encrypted archive migration and a verified restore.

The current deployment is healthy and remote. Telegram and WhatsApp sessions are hosted on DigitalOcean; Signal remains phone-link dependent; Discord remains experimental. The current service monitor reports the only known operational warning: off-server backup storage has not yet been configured.
