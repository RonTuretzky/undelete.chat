#!/usr/bin/env python3
"""Upload a reviewed build, run it behind HTTPS, and initialize a private owner."""
import json, pathlib, secrets, subprocess, tarfile, tempfile, shlex, re
from urllib.parse import urlsplit
root = pathlib.Path(__file__).resolve().parent.parent
private = pathlib.Path.home() / '.config' / 'afterword'
state = json.loads((private / 'deployment.json').read_text())
if not state.get('ip'): raise SystemExit('Run provision.py again to resolve the server IP.')
ssh_options = ['-i', str(private / 'deploy_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-o', 'ConnectTimeout=15']
target = 'root@' + state['ip']
def remote(command, input=None, capture=False):
    return subprocess.run(['ssh', *ssh_options, target, command], input=input, text=True, check=True, capture_output=capture)
remote('cloud-init status --wait', capture=True)
secrets_path = private / 'app-secrets.json'
if secrets_path.exists(): values = json.loads(secrets_path.read_text())
else:
    values = {'archive_key': secrets.token_hex(32), 'invite_code': secrets.token_urlsafe(24), 'owner_password': secrets.token_urlsafe(28), 'owner_username': 'owner'}
    secrets_path.write_text(json.dumps(values, indent=2)); secrets_path.chmod(0o600)
hosted_path = private / 'hosted-config.json'
hosted = json.loads(hosted_path.read_text()) if hosted_path.exists() else {}
capacity_path = private / 'capacity-config.json'
capacity = json.loads(capacity_path.read_text()) if capacity_path.exists() else {}
billing_path = private / 'billing-config.json'
billing = json.loads(billing_path.read_text()) if billing_path.exists() else {}
billing_names = {'stripe_secret_key': 'STRIPE_SECRET_KEY', 'stripe_webhook_secret': 'STRIPE_WEBHOOK_SECRET', 'stripe_price_id': 'STRIPE_PRICE_ID'}
if billing_path.exists() and (not isinstance(billing, dict) or any(not isinstance(billing.get(name), str) or not re.fullmatch(r'[A-Za-z0-9_]+', billing[name]) for name in billing_names)):
    raise SystemExit('Billing configuration requires stripe_secret_key, stripe_webhook_secret, and stripe_price_id strings. Remove the file to disable billing.')
if billing and (not isinstance(billing.get('trial_days', 14), int) or not re.fullmatch(r'[A-Za-z0-9$€£ .,/-]{0,40}', str(billing.get('price_label', '')))):
    raise SystemExit('Billing trial_days must be a whole number.')
native_push_path = private / 'native-push-config.json'
native_push = json.loads(native_push_path.read_text()) if native_push_path.exists() else {}
native_env = []
if native_push:
    apns = native_push.get('apns') or {}
    if apns:
        key_file = private / apns.get('key_file', 'apns.p8')
        if not all(isinstance(apns.get(k), str) and re.fullmatch(r'[A-Z0-9]{10}', apns[k]) for k in ('key_id', 'team_id')) or not key_file.exists():
            raise SystemExit('APNs configuration needs key_id, team_id (ten characters each) and an existing .p8 key file.')
        native_env += ['APNS_KEY_ID=' + apns['key_id'], 'APNS_TEAM_ID=' + apns['team_id'], 'APNS_BUNDLE_ID=' + apns.get('bundle_id', 'chat.undelete.app'),
                       'APNS_SANDBOX=' + ('true' if apns.get('sandbox') else 'false'), 'APNS_PRIVATE_KEY=' + key_file.read_text().strip().replace('\n', '\\n')]
    fcm_file = native_push.get('fcm_service_account_file')
    if fcm_file:
        account = json.loads((private / fcm_file).read_text())
        if not all(account.get(k) for k in ('project_id', 'client_email', 'private_key')):
            raise SystemExit('The FCM service account file is missing project_id, client_email, or private_key.')
        native_env.append('FCM_SERVICE_ACCOUNT=' + json.dumps(account, separators=(',', ':')))
offsite_path = private / 'offsite-config.json'
offsite = json.loads(offsite_path.read_text()) if offsite_path.exists() else {}
if offsite_path.exists() and (not isinstance(offsite, dict) or not offsite):
    raise SystemExit('Offsite configuration must contain all four storage settings. Remove the file to disable offsite replication.')
offsite_names = {'endpoint': 'BACKUP_S3_ENDPOINT', 'bucket': 'BACKUP_S3_BUCKET',
                 'access_key': 'BACKUP_S3_ACCESS_KEY', 'secret_key': 'BACKUP_S3_SECRET_KEY'}
if offsite and any(not isinstance(offsite.get(name), str) or not offsite[name] or any(c in offsite[name] for c in '\r\n\x00') for name in offsite_names):
    raise SystemExit('Offsite storage requires endpoint, bucket, access_key, and secret_key strings without newlines.')
if offsite:
    endpoint = urlsplit(offsite['endpoint'])
    if endpoint.scheme != 'https' or not re.fullmatch(r'[a-z]+\d\.digitaloceanspaces\.com', endpoint.netloc) or endpoint.path not in ('', '/') or endpoint.query or endpoint.fragment:
        raise SystemExit('Offsite endpoint must be a DigitalOcean Spaces regional HTTPS endpoint.')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', offsite['bucket']) or any(not re.fullmatch(r'[A-Za-z0-9/+=_-]+', offsite[name]) for name in ('access_key', 'secret_key')):
        raise SystemExit('Invalid offsite bucket or credential format.')
capacity_env = {'ARCHIVE_ACCOUNT_BYTES': capacity.get('account_bytes', 128 * 1024**2),
                'ARCHIVE_SERVER_BYTES': capacity.get('server_bytes', 1024**3),
                'ARCHIVE_MIN_FREE_BYTES': capacity.get('minimum_free_bytes', 2 * 1024**3)}
if any(type(value) is not int or not 0 < value <= 9007199254740991 for value in capacity_env.values()):
    raise SystemExit('Archive capacity settings must be positive integer byte counts.')
env = '\n'.join(['ARCHIVE_KEY=' + values['archive_key'], 'INVITE_CODE=' + values.get('invite_code', ''), 'PUBLIC_ORIGIN=' + state['url'], 'NODE_ENV=production',
    'HOSTED_COLLECTORS=' + ('true' if hosted.get('enabled') else 'false'),
    'HOSTED_MAX_COLLECTORS=' + str(int(hosted.get('max_collectors', 4))),
    'TELEGRAM_API_ID=' + str(int(hosted.get('telegram_api_id', 0))),
    'TELEGRAM_API_HASH=' + str(hosted.get('telegram_api_hash', '')),
    *[name + '=' + str(value) for name, value in capacity_env.items()],
    *[env_name + '=' + offsite[name] for name, env_name in offsite_names.items() if offsite],
    *native_env,
    *([env_name + '=' + billing[name] for name, env_name in billing_names.items()] + ['BILLING_TRIAL_DAYS=' + str(billing.get('trial_days', 14)),
      'BILLING_EXEMPT_USERS=' + ','.join(billing.get('exempt_users', [values['owner_username']])), 'BILLING_PRICE_LABEL=' + str(billing.get('price_label', ''))] if billing else [])]) + '\n'
env_path = private / 'app.env'; env_path.write_text(env); env_path.chmod(0o600)
invite_path = private / 'invitation-code.txt'
if values.get('invite_code'): invite_path.write_text(values['invite_code']); invite_path.chmod(0o600)
elif invite_path.exists(): invite_path.unlink()
credentials = private / 'owner-credentials.txt'
# Written once. Delete it after the owner has changed the password in Settings.
if not credentials.exists(): credentials.write_text('undelete.chat owner access\n\nURL: ' + state['url'] + '\nUsername: ' + values['owner_username'] + '\nPassword: ' + values['owner_password'] + '\n\n' + ('Invitation code for new accounts: ' + values['invite_code'] + '\n\n' if values.get('invite_code') else 'Registration is open; every new workspace starts a free trial.\n\n') + 'Keep this file private. Change the owner password in Settings after signing in.\n')
if credentials.exists(): credentials.chmod(0o600)
with tempfile.TemporaryDirectory(prefix='afterword-deploy-') as tmp:
    archive = pathlib.Path(tmp) / 'source.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for name in ['server', 'web', 'companion', 'tests', 'deploy', 'docs', 'package.json', 'package-lock.json', 'vite.config.js', 'Dockerfile', '.dockerignore', 'README.md']:
            tar.add(root / name, arcname=name)
    remote('install -d -m 700 /opt/afterword')
    subprocess.run(['scp', *ssh_options, str(archive), target + ':/opt/afterword/source.tar.gz'], check=True)
    remote('tar -xzf /opt/afterword/source.tar.gz -C /opt/afterword && rm /opt/afterword/source.tar.gz')
subprocess.run(['scp', *ssh_options, str(env_path), target + ':/opt/afterword/deploy/.env'], check=True)
apk = root / 'mobile' / 'android' / 'app' / 'build' / 'outputs' / 'apk' / 'local' / 'release' / 'app-local-release.apk'
if apk.exists():
    # The phone-only Android edition is offered as a download; publish it with its checksum.
    import hashlib
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    remote('install -d -m 755 /opt/afterword/downloads')
    subprocess.run(['scp', *ssh_options, str(apk), target + ':/opt/afterword/downloads/undelete-phone-only.apk'], check=True)
    remote('printf "%s  undelete-phone-only.apk\n" ' + shlex.quote(digest) + ' > /opt/afterword/downloads/undelete-phone-only.apk.sha256 && chmod 644 /opt/afterword/downloads/*')
remote('chmod 600 /opt/afterword/deploy/.env && cd /opt/afterword && docker compose -f deploy/compose.yaml up -d --build')
# Every deploy leaves the previous image and build layers behind; without this the disk fills over months.
remote('docker image prune -f >/dev/null && docker builder prune -f --keep-storage 1GB >/dev/null && docker system df --format "{{.Type}} {{.Size}} reclaimable={{.Reclaimable}}" | head -1', capture=True)
# Seed via stdin, never with passwords in shell arguments or console output.
seed = """import {createStore} from './server/store.mjs';
const store=createStore('/data/afterword.sqlite',process.env.ARCHIVE_KEY);
const input=REPLACE;
if(!store.userByName(input.username)) await store.createUser(input.username,input.password);
store.close(); console.log('Owner account initialized.');
""".replace('REPLACE', json.dumps({'username': values['owner_username'], 'password': values['owner_password']}))
remote('cd /opt/afterword && docker compose -f deploy/compose.yaml exec -T app node --input-type=module', input=seed)
common = '(hardened) {\n encode zstd gzip\n request_body {\n  max_size 8MB\n }\n header Strict-Transport-Security "max-age=31536000; includeSubDomains"\n header -Server\n}\n'
caddy = common + state['hostname'] + ' {\n import hardened\n reverse_proxy 127.0.0.1:4318\n}\n'
# Aliases such as www redirect to the canonical origin.
for alias in state.get('aliases', []):
    caddy += alias + ' {\n import hardened\n redir ' + state['url'] + '{uri} permanent\n}\n'
# The previous hostname keeps answering API calls (Stripe webhooks, companions
# configured before the move) and redirects browsers to the new origin.
if state.get('legacy_hostname') and state['legacy_hostname'] != state['hostname']:
    caddy += state['legacy_hostname'] + ' {\n import hardened\n handle /api/* {\n  reverse_proxy 127.0.0.1:4318\n }\n handle {\n  redir ' + state['url'] + '{uri} permanent\n }\n}\n'
remote('cat > /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile && systemctl enable --now caddy && systemctl reload caddy', input=caddy)
remote('cd /opt/afterword && docker compose -f deploy/compose.yaml ps')
print('Deployed:', state['url'])
print('Owner credentials:', credentials)
