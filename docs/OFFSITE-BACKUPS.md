# Encrypted off-server backups

The replication and offline restore commands are implemented. **Offsite storage is not yet activated for this deployment.** The DigitalOcean `/v2/spaces/keys` API returned HTTP 404 with the supplied account access on September 10, 2026, and the control panel requires sign-in. No Spaces bucket, key, or subscription has been created by this setup.

The server can upload backups directly to DigitalOcean Spaces. No customer installation or always-on operator computer is involved. A Spaces subscription starts at $5/month, including 250 GiB storage and 1,024 GiB outbound transfer; it is shared across the account's buckets. Check existing account usage before creating the first bucket. [Provider pricing](https://docs.digitalocean.com/products/spaces/details/pricing/)

## Activate storage

1. Sign in to the DigitalOcean account that hosts undelete.chat. Create a **private dedicated bucket**, preferably in NYC3 beside the current server. Disable public file listing and leave the CDN off. Do not reuse a bucket containing another application's data.
2. Create a Spaces access key with read/write permission limited to this bucket. undelete.chat needs to upload, list, read back, and expire its backup objects; it does not need a full-account Spaces key. [Bucket access](https://docs.digitalocean.com/products/spaces/how-to/manage-access/)
3. Save a mode-600 file at `~/.config/afterword/offsite-config.json` with these fields, substituting the actual bucket and credentials. Do not commit this file or send its contents through chat:

   ```json
   {
     "endpoint": "https://nyc3.digitaloceanspaces.com",
     "bucket": "YOUR-PRIVATE-BUCKET",
     "access_key": "YOUR-SPACES-ACCESS-KEY",
     "secret_key": "YOUR-SPACES-SECRET-KEY"
   }
   ```

4. Run `python3 deploy/deploy.py`. The deploy command validates and transfers this configuration privately. Omitting the file leaves offsite replication disabled; partially supplied configuration is rejected.
5. Run `python3 deploy/operations.py backup-status`. Expect `offsiteConfigured: true`, `state: complete`, a recent `lastOffsiteAt`, and a snapshot identifier. `local_only` means the server has no offsite configuration. `failed` identifies snapshot, upload, cleanup, or disk-capacity failure without printing credentials.
6. List and restore a committed backup using the procedure below. Record the actual storage endpoint, successful verification time, restored counts, integrity checks, and whether session decryption passed. Until this succeeds against the real service, test fixtures are not evidence of a working production backup.

Configure a seven-day bucket lifecycle rule as an additional expiry mechanism if available; it continues to operate while undelete.chat is offline. The application also removes its own expired objects after a recent verified upload. Do not change lifecycle rules on shared storage. [Lifecycle support](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/)

## Operation and protection

Production makes a complete local SQLite snapshot at startup and every 24 hours. With storage configured, it encrypts and uploads that snapshot, then retries failed replication every 15 minutes. Checks do not create an additional local snapshot until the daily interval elapses. An interrupted server upload can be retried after restart.

The replica encrypts the entire SQLite files and the manifest with AES-256-GCM. Its key is derived from the original archive key using HKDF with a separate backup context. Each object uses a fresh nonce and authenticates its complete object name. Thus database metadata, usernames, archived message ciphertext, and saved collector sessions are encrypted in the stored replica. Object names expose snapshot times and opaque connection identifiers. The archive key is excluded and must be retained separately to restore; losing that key makes the replicas unreadable.

Each object is uploaded with private access, downloaded immediately, and checked against its SHA-256 and size. The encrypted manifest is published last, after all database checks pass. It identifies a complete copy. Each upload attempt uses a new identifier so retries cannot overwrite an earlier committed copy. A local receipt records readback verification; subsequent checks also verify that the remote manifest still exists with the recorded size and hash metadata.

Expired objects are removed only from the dedicated `afterword/v1/` namespace, only after seven days, and only when a recent verified backup is available. This includes abandoned upload attempts. The current verified copy is protected from cleanup. Expiry is best effort: connectivity failures, unavailable credentials, or an offline server can delay it unless provider lifecycle rules are also enabled. These replicas share the provider account with the server; they protect against server-disk loss, not compromise or loss of the entire provider account.

Encryption and transfers stream from disk. Files have a 4 GiB limit; larger files cause an explicit failure. One extra encrypted copy of the current database is staged on the server during upload, subject to the configured free-disk reserve. Restore needs space for the completed output plus one encrypted and one decrypted current file. Failed or interrupted uploads preserve earlier complete backups. Temporary upload files are removed after a handled failure and at the next application startup.

## List and restore without starting collectors

On the production host, listing is read-only:

```sh
cd /opt/afterword
docker compose -f deploy/compose.yaml exec -T app node server/offsite.mjs list
```

For an offline rehearsal, use a separate private working directory with a copy of the matching application release and its dependencies. Supply the four `BACKUP_S3_*` settings and the original `ARCHIVE_KEY` through a private environment file; do not place credentials in command arguments. The normal deployment writes those settings to the private `app.env`. Prefer copying only the required backup settings and archive key for a rehearsal, without unrelated owner credentials or platform application secrets.

```sh
node --env-file=/PRIVATE/PATH/backup.env server/offsite.mjs list
node --env-file=/PRIVATE/PATH/backup.env server/offsite.mjs restore SNAPSHOT_ID UPLOAD_ID /PRIVATE/NEW/RESTORE/DIRECTORY
```

The destination must not exist. The restore command checks object hashes, authenticated encryption, manifest paths, file sizes, and disk capacity before publishing the restored directory. It writes private files and never starts the web service, collector workers, or platform clients. A failed authentication or download removes staged plaintext and does not publish the destination.

Next, run SQLite `PRAGMA integrity_check` and decrypt representative archive revisions and collector metadata with the matching archive key. The store and encrypted queue libraries can be used offline for those checks. Compare aggregate counts and ciphertext hashes against the source snapshot. Do not open a restored directory with `server/index.mjs` during a rehearsal. A copied Telegram session connecting from another IP can invalidate the live session. Follow the [full restore procedure](OPERATIONS.md#restore-procedure) for a real failover, with the old collectors stopped before starting a replacement.

## Verification so far

Automated tests exercise archive/revision/session round trips, full-file encryption, readback corruption, wrong keys, failed uploads, retry immutability, unsafe paths, symlinks, disk reserves, paginated object listing, expiry boundaries, serialized scheduling, and redacted status reporting. The real S3 SDK also streamed and restored a 32 MiB SQLite database through a local HTTP fixture under a 64 MiB heap limit. All 83 application tests and the production build pass.

On September 10 at 18:18 UTC, a copy of a fresh production snapshot completed that encrypted HTTP transfer and offline restore. All four SQLite files were unchanged; integrity, decryption of 91 archived messages with 117 events, and 41 encrypted collector metadata records passed. No collector was started. These checks used simulated storage. Activation, a real Spaces round trip, and provider retention verification remain pending.
