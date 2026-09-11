# Operating the hosted service

undelete.chat runs on DigitalOcean. The public website, archive database, and hosted collectors continue running when the operator's computer or a customer's browser is closed. The private `127.0.0.1` setup page is an optional local shortcut; customers use the public HTTPS app and approve account linking on their phones.

## Inspect production

Run from the repository with the private deployment credentials in `~/.config/afterword`:

```sh
python3 deploy/operations.py status
python3 deploy/operations.py uptime-status
python3 deploy/operations.py backup-status
```

These commands do not print the DigitalOcean token or platform credentials. The recorded deployment must identify the Undelete Droplet. Public `/api/health` verifies the web process can query SQLite; it does not prove that every platform is connected or that backups are current. Check Connections for each platform's state. An idle conversation can have no new messages while its collector is healthy.

On the server, the source is in `/opt/afterword`. The application is managed by `docker compose -f deploy/compose.yaml`. Caddy terminates HTTPS and proxies to the application on the host's loopback interface. Docker restarts the application, and its supervisor restores enabled hosted sessions. Never start the retired local collectors alongside the hosted sessions.

## Backups and keys

Two recovery layers are configured:

| Layer | Contents | Retention | Verification |
| --- | --- | --- | --- |
| Application snapshots | Online SQLite snapshots of encrypted collector queues followed by the archive; manifest excludes the archive key | Latest seven successful snapshots, made at startup and every 24 hours | A production snapshot was downloaded and restored in an isolated directory on September 10, 2026; integrity and decryption of 49 messages and both linked sessions passed |
| DigitalOcean daily backups | Full Droplet disk image, including the Docker data volume and service environment with decryption configuration | Seven days | Policy enabled September 10; window is 20:00–00:00 UTC. The first image completed at 20:02 UTC on September 10 (11.21 GB). A full image restore has not been rehearsed; see the isolation warning below |

Application snapshots are under `/data/backups` inside the container. They share the server disk and cannot alone survive loss of that disk. The Docker named data volume is on the Droplet's boot disk, so the configured server images include it. Separate DigitalOcean block volumes would require their own backup policy.

**Full-server backups include the archive key.** They do not provide the key separation of the application snapshots. DigitalOcean documents that its backup images are not encrypted at rest and are not externally accessible. Treat access to server images as access to the entire service. Keep an independent copy of the archive key in the operator's password manager; do not put it in the repository or an application snapshot. [Provider limitations](https://docs.digitalocean.com/products/backups/details/limits/)

```sh
# Idempotent: preserve an already-enabled backup policy.
python3 deploy/operations.py enable-daily-backups --hour 20

# On the production host, make an online application snapshot.
cd /opt/afterword
docker compose -f deploy/compose.yaml exec -T app node server/backup.mjs
```

Confirm a new manifest exists and contains the archive and expected collector queues. A successful enablement action proves the schedule was configured; it does not prove an image has been created. Inspect `operations.py status` for completed backup IDs and dates. Encrypted off-server replication, retry scheduling, and offline restore commands are implemented but storage activation and a real provider round trip remain outstanding; see [offsite setup](OFFSITE-BACKUPS.md). Local backup freshness is covered by the external check against `/api/monitor`, which fails when the newest application snapshot is older than 26 hours; see [External monitoring](#external-monitoring).

## Restore procedure

1. Preserve the current data and source revision before replacement. Do not use `docker compose down -v`; that deletes the active archive volume.
2. Download a complete application snapshot and check its manifest. Restore into a new, private directory. Use the matching archive key to run SQLite integrity checks and decrypt representative archive and session records without starting collectors.
3. Before booting a full-server restore, isolate its outbound network and disable collector startup. A cloned Telegram session connecting from a second IP can invalidate the live session. Never run a recovery rehearsal with production collectors online in both locations.
4. For actual failover, stop the old collectors, install the complete archive and queue snapshot with the original key, and start exactly one replacement service. Restore file ownership to the container's application user. Expect gaps after the snapshot and possible phone reapproval; a backup is not a guarantee of uninterrupted capture.
5. Verify HTTPS, sign-in, account separation, archive counts, decryption, and each collector before reopening registration. Record the snapshot time, recovery duration, observed gaps, and any required relinking.

Use matching application and database versions for rollback. Older writer code does not maintain the new archive usage fields; do not run it against a migrated database. Preserve the current data and restore a verified complete snapshot with its matching release when rolling back a migration.

## External monitoring

The `Undelete availability` DigitalOcean Uptime check probes the public HTTPS service monitor (`/api/monitor`) from US East and Western Europe. It runs independently of the undelete.chat server and the operator's computer. The monitor endpoint returns 503 when the in-process operations monitor reports a critical issue: database unavailable, disk below the reserve, archive full, local backup missing or older than 26 hours, backup scheduler stale, a connected collector with a stale heartbeat, or a delivery queue older than five minutes. A warning-only state, such as `offsite_unconfigured`, still returns 200.

```sh
# Reuse the existing matching check instead of creating a duplicate.
python3 deploy/operations.py enable-uptime
# Point the existing check at /api/monitor after probing that it validates.
python3 deploy/operations.py enable-service-monitor
# Attach notifications to the existing check and Droplet metrics.
python3 deploy/operations.py enable-alerts
python3 deploy/operations.py uptime-status
python3 deploy/operations.py alert-status
```

`enable-uptime` and `enable-service-monitor` preserve existing checks, including disabled checks and other applications' monitoring. `enable-alerts` is idempotent: it creates a `down_global` alert (two-minute period) and an `ssl_expiry` alert (14 days) on the undelete.chat check, plus Droplet alert policies for disk utilization above 85% and memory utilization above 90% over five minutes. Existing alerts of the same type are left unchanged, including any additional recipients. The recipient defaults to the verified DigitalOcean account email; pass `--email` to use another address. The command records what it created in private `alert-enablement.json` and sets `deliveryVerified: false`; notification delivery has not been exercised by an actual outage, so confirm the first alert email arrives and is not filtered before relying on it. The service monitor's own detailed report is available to the operator through `service-status`; the public endpoint intentionally exposes only `ok` and the service name.

## Server maintenance

The Droplet runs Ubuntu 24.04 LTS with `unattended-upgrades` installing security updates daily. Caddy comes from the official `dl.cloudsmith.io/public/caddy/stable` apt repository rather than Ubuntu's community-maintained package, so `apt-get upgrade` tracks Caddy's own security releases; version 2.11.4 was installed on September 10 and the certificates in `/var/lib/caddy` were preserved across the upgrade. SSH accepts only the deployment key: password authentication is disabled and root login is limited to public keys (`/etc/ssh/sshd_config.d/70-afterword.conf`). `ufw` allows only 22, 80, and 443/tcp; HTTP/3 is advertised by Caddy but 443/udp is intentionally not opened. The application container runs read-only as an unprivileged user with all capabilities dropped.

Kernel updates leave `/var/run/reboot-required` behind. A reboot restarts Caddy, Docker, and the application; the supervisor restores every enabled hosted session afterwards, so customers do not need to relink. Expect about one to two minutes of downtime, which is below the `down_global` alert period. Reboot during a quiet period and verify recovery:

```sh
ssh -i ~/.config/afterword/deploy_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=~/.config/afterword/known_hosts root@159.65.242.65 \
  'apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade && ls /var/run/reboot-required && systemctl reboot'
# After it returns:
python3 deploy/operations.py service-status
```

Check that `status` is not `critical`, that every previously connected collector reports `connected` with a fresh `lastSeen`, and that the public `/api/monitor` answers 200. The September 10 reboot after a kernel update was verified this way; see the readiness evidence log.

## Billing

Subscription billing is optional and configured from private `~/.config/afterword/billing-config.json`:

```json
{
  "stripe_secret_key": "sk_live_...",
  "stripe_webhook_secret": "whsec_...",
  "stripe_price_id": "price_...",
  "trial_days": 14,
  "exempt_users": ["owner"],
  "price_label": "$5"
}
```

Setup in the Stripe Dashboard: create a product with one recurring price and copy its `price_...` id; create a restricted key with write access to Checkout Sessions, Customer Portal sessions, and read access to Subscriptions (a full secret key also works); enable the customer portal with invoice history, payment-method updates, and cancellation at period end; and add a webhook endpoint for `https://<public origin>/api/billing/webhook` subscribed to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed`, then copy its signing secret. `price_label` is display text for the landing page and plan card; keep it in step with the Stripe price. Run `python3 deploy/deploy.py` after saving the file; the values reach the service only through the private `.env`. Use Stripe test keys first and confirm the plan card in Settings shows Active after a test checkout before switching to live keys.

Entitlement is decided from the local database, so a Stripe outage cannot pause capture. When a subscription lapses, the server suspends that account's hosted collectors and marks them with a subscription message; the customer resumes them from Connections after paying. Companion and extension events stay queued at the client (bounded by the collector queue limit) and deliver after the subscription becomes active. Trial-only accounts are gated by their trial end date; pre-billing accounts receive the trial measured from their creation date. Operator usernames listed in `exempt_users` are never gated.

Webhook deliveries are idempotent and safe to replay from the Stripe Dashboard. The service logs only Stripe error types, never customer identifiers or card data. Removing `billing-config.json` and redeploying disables billing entirely; existing subscription records are kept but not enforced.

## Cost and capacity

Archive defaults are 128 MiB per account, 1 GiB of charged archive data globally, and a 2 GiB free-disk reserve. Production overrides these through `capacity-config.json`: 128 MiB per account, 4 GiB globally, and an 8 GiB free-disk reserve on the 80 GB disk, leaving room for seven full backup copies of a 4 GiB archive. Settings shows the account's allowance and usage; stopped sources retain their queued copies and require Resume capture → Try again after the issue is resolved. Existing over-limit archives are preserved. Keep enough headroom for SQLite indexes/WAL, collector sessions, native caches, builds, and seven backup copies; the charged archive budget is not physical disk usage.

Deployment reads optional private `~/.config/afterword/capacity-config.json` values: `account_bytes`, `server_bytes`, and `minimum_free_bytes`, all positive integer byte counts. These become `ARCHIVE_ACCOUNT_BYTES`, `ARCHIVE_SERVER_BYTES`, and `ARCHIVE_MIN_FREE_BYTES` in the service environment. Omitting the file preserves the documented defaults. A user's nullable `users.archive_limit_bytes` is an operator-controlled override for future plans; no public endpoint lets a customer increase it. Payment plans are not configured yet.

Before increasing limits, measure available disk and memory, allow for backups, and test the intended number of collectors. Do not reduce limits expecting automatic deletion: a smaller allowance stops subsequent growth. To release archive allowance, remove history or shorten retention; deletion markers remain to prevent replay. If a collector queue itself fills, inspect its encrypted storage and delivery errors before clearing anything. Relinking is rejected while pending or quarantined copies remain; it is not a storage-cleanup shortcut. The check runs again after worker shutdown to cover an event arriving during the stop.

The backup routine checks the configured free-space reserve before copying each database. Insufficient space aborts the new snapshot and keeps earlier complete backups. Monitor failures and backup age externally; a free-space guard alone is not an alert or a recovery copy.

The Droplet was resized on September 11 from `s-1vcpu-1gb` to `s-2vcpu-4gb` (2 vCPU, 4 GB RAM, 80 GB disk) at $24/month; daily backups are 20% of that ($4.80/month) and the additional uptime check adds $1/month: approximately $29.80/month before taxes and usage-based charges. The 2 GB swap file remains. Resize again with `python3 deploy/operations.py resize --size <slug> --disk`; the command shuts the server down gracefully, resizes, powers it back on, and records the result privately. Expect one to two minutes of downtime, which trips the outage alert. Growing the disk is permanent; omit `--disk` for a reversible CPU/RAM-only change. Stripe charges its standard per-transaction fee on each subscription payment; there is no fixed monthly cost. The account already uses its one free uptime check elsewhere. [Backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Uptime pricing](https://docs.digitalocean.com/products/uptime/details/pricing/)

The machine has 4 GB RAM and a global limit of 30 hosted collectors (`max_collectors` in `hosted-config.json`), sized for about 20 customers with one or two linked accounts each. Measured on September 11: a Telegram or WhatsApp worker uses about 60–70 MB of resident memory and ten threads, the main server about 70 MB; signal-cli is a separate native process and is comparatively memory intensive, so budget roughly 250 MB for each Signal source. The container's process limit is 1024 and its tmpfs is 512 MB. Measure memory and process counts with `docker stats` before raising `max_collectors` again, and resize to the 8 GB size before exceeding about 40 collectors. See [SaaS readiness](SAAS-READINESS.md) for the remaining launch requirements.
