# Operating the hosted service

Afterword runs on DigitalOcean. The public website, archive database, and hosted collectors continue running when the operator's computer or a customer's browser is closed. The private `127.0.0.1` setup page is an optional local shortcut; customers use the public HTTPS app and approve account linking on their phones.

## Inspect production

Run from the repository with the private deployment credentials in `~/.config/afterword`:

```sh
python3 deploy/operations.py status
python3 deploy/operations.py uptime-status
```

These commands do not print the DigitalOcean token or platform credentials. The recorded deployment must identify the Afterword Droplet. Public `/api/health` verifies the web process can query SQLite; it does not prove that every platform is connected or that backups are current. Check Connections for each platform's state. An idle conversation can have no new messages while its collector is healthy.

On the server, the source is in `/opt/afterword`. The application is managed by `docker compose -f deploy/compose.yaml`. Caddy terminates HTTPS and proxies to the application on the host's loopback interface. Docker restarts the application, and its supervisor restores enabled hosted sessions. Never start the retired local collectors alongside the hosted sessions.

## Backups and keys

Two recovery layers are configured:

| Layer | Contents | Retention | Verification |
| --- | --- | --- | --- |
| Application snapshots | Online SQLite snapshots of encrypted collector queues followed by the archive; manifest excludes the archive key | Latest seven successful snapshots, made at startup and every 24 hours | A production snapshot was downloaded and restored in an isolated directory on September 10, 2026; integrity and decryption of 49 messages and both linked sessions passed |
| DigitalOcean daily backups | Full Droplet disk image, including the Docker data volume and service environment with decryption configuration | Seven days | Policy enabled September 10; first window is 20:00–00:00 UTC; first completed image and full image restore are still unverified |

Application snapshots are under `/data/backups` inside the container. They share the server disk and cannot alone survive loss of that disk. The Docker named data volume is on the Droplet's boot disk, so the configured server images include it. Separate DigitalOcean block volumes would require their own backup policy.

**Full-server backups include the archive key.** They do not provide the key separation of the application snapshots. DigitalOcean documents that its backup images are not encrypted at rest and are not externally accessible. Treat access to server images as access to the entire service. Keep an independent copy of the archive key in the operator's password manager; do not put it in the repository or an application snapshot. [Provider limitations](https://docs.digitalocean.com/products/backups/details/limits/)

```sh
# Idempotent: preserve an already-enabled backup policy.
python3 deploy/operations.py enable-daily-backups --hour 20

# On the production host, make an online application snapshot.
cd /opt/afterword
docker compose -f deploy/compose.yaml exec -T app node server/backup.mjs
```

Confirm a new manifest exists and contains the archive and expected collector queues. A successful enablement action proves the schedule was configured; it does not prove an image has been created. Inspect `operations.py status` for completed backup IDs and dates. Automatic replication of application snapshots to a separate storage account and backup-freshness alerts remain outstanding.

## Restore procedure

1. Preserve the current data and source revision before replacement. Do not use `docker compose down -v`; that deletes the active archive volume.
2. Download a complete application snapshot and check its manifest. Restore into a new, private directory. Use the matching archive key to run SQLite integrity checks and decrypt representative archive and session records without starting collectors.
3. Before booting a full-server restore, isolate its outbound network and disable collector startup. A cloned Telegram session connecting from a second IP can invalidate the live session. Never run a recovery rehearsal with production collectors online in both locations.
4. For actual failover, stop the old collectors, install the complete archive and queue snapshot with the original key, and start exactly one replacement service. Restore file ownership to the container's application user. Expect gaps after the snapshot and possible phone reapproval; a backup is not a guarantee of uninterrupted capture.
5. Verify HTTPS, sign-in, account separation, archive counts, decryption, and each collector before reopening registration. Record the snapshot time, recovery duration, observed gaps, and any required relinking.

Use matching application and database versions for rollback. Older writer code does not maintain the new archive usage fields; do not run it against a migrated database. Preserve the current data and restore a verified complete snapshot with its matching release when rolling back a migration.

## External monitoring

The `Afterword availability` DigitalOcean Uptime check probes the public HTTPS health endpoint from US East and Western Europe. It runs independently of the Afterword server and the operator's computer.

```sh
# Reuse the existing matching check instead of creating a duplicate.
python3 deploy/operations.py enable-uptime
python3 deploy/operations.py uptime-status
```

The command preserves existing checks, including disabled checks and other applications' monitoring. No email or Slack notifications are created by this command. An alert recipient is still required; do not describe notifications as enabled until an alert is configured and delivery is verified. Availability monitoring does not replace collector-state, disk-space, or backup-age monitoring.

## Cost and capacity

Archive defaults are 128 MiB per account, 1 GiB of charged archive data globally, and a 2 GiB free-disk reserve. Settings shows the account's allowance and usage; stopped sources retain their queued copies and require Resume capture → Try again after the issue is resolved. Existing over-limit archives are preserved. Keep enough headroom for SQLite indexes/WAL, collector sessions, native caches, builds, and seven backup copies; the charged archive budget is not physical disk usage.

Deployment reads optional private `~/.config/afterword/capacity-config.json` values: `account_bytes`, `server_bytes`, and `minimum_free_bytes`, all positive integer byte counts. These become `ARCHIVE_ACCOUNT_BYTES`, `ARCHIVE_SERVER_BYTES`, and `ARCHIVE_MIN_FREE_BYTES` in the service environment. Omitting the file preserves the documented defaults. A user's nullable `users.archive_limit_bytes` is an operator-controlled override for future plans; no public endpoint lets a customer increase it. Payment plans are not configured yet.

Before increasing limits, measure available disk and memory, allow for backups, and test the intended number of collectors. Do not reduce limits expecting automatic deletion: a smaller allowance stops subsequent growth. To release archive allowance, remove history or shorten retention; deletion markers remain to prevent replay. If a collector queue itself fills, inspect its encrypted storage and delivery errors before clearing anything. Relinking is rejected while pending or quarantined copies remain; it is not a storage-cleanup shortcut. The check runs again after worker shutdown to cover an event arriving during the stop.

The backup routine checks the configured free-space reserve before copying each database. Insufficient space aborts the new snapshot and keeps earlier complete backups. Monitor failures and backup age externally; a free-space guard alone is not an alert or a recovery copy.

The current Droplet is $6/month, daily backups add $1.80/month, and the additional uptime check adds $1/month: approximately $8.80/month before taxes and usage-based charges. The account already uses its one free uptime check elsewhere. [Backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/), [Uptime pricing](https://docs.digitalocean.com/products/uptime/details/pricing/)

The current machine has 1 GB RAM and a global limit of four hosted collectors. This is a small pilot deployment, not capacity for an unrestricted public signup. Signal is comparatively memory intensive. Keep the invitation gate until memory limits, archive pagination/search, storage growth, and multi-customer load have been addressed and measured. See [SaaS readiness](SAAS-READINESS.md) for the remaining launch requirements.
