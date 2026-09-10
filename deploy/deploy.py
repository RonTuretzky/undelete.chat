#!/usr/bin/env python3
"""Upload a reviewed build, run it behind HTTPS, and initialize a private owner."""
import json, pathlib, secrets, subprocess, tarfile, tempfile, shlex
root = pathlib.Path(__file__).resolve().parent.parent
private = pathlib.Path.home() / '.config' / 'afterword'
state = json.loads((private / 'deployment.json').read_text())
if not state.get('ip'): raise SystemExit('Run provision.py again to resolve the server IP.')
ssh_options = ['-i', str(private / 'deploy_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(private / 'known_hosts'), '-o', 'ConnectTimeout=15']
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
env = '\n'.join(['ARCHIVE_KEY=' + values['archive_key'], 'INVITE_CODE=' + values['invite_code'], 'PUBLIC_ORIGIN=' + state['url'], 'NODE_ENV=production',
    'HOSTED_COLLECTORS=' + ('true' if hosted.get('enabled') else 'false'),
    'HOSTED_MAX_COLLECTORS=' + str(int(hosted.get('max_collectors', 4))),
    'TELEGRAM_API_ID=' + str(int(hosted.get('telegram_api_id', 0))),
    'TELEGRAM_API_HASH=' + str(hosted.get('telegram_api_hash', ''))]) + '\n'
env_path = private / 'app.env'; env_path.write_text(env); env_path.chmod(0o600)
invite_path = private / 'invitation-code.txt'; invite_path.write_text(values['invite_code']); invite_path.chmod(0o600)
credentials = private / 'owner-credentials.txt'
credentials.write_text('Afterword owner access\n\nURL: ' + state['url'] + '\nUsername: ' + values['owner_username'] + '\nPassword: ' + values['owner_password'] + '\n\nInvitation code for new accounts: ' + values['invite_code'] + '\n\nKeep this file private. Change the owner password in Settings after signing in.\n')
credentials.chmod(0o600)
with tempfile.TemporaryDirectory(prefix='afterword-deploy-') as tmp:
    archive = pathlib.Path(tmp) / 'source.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        for name in ['server', 'web', 'companion', 'discord-extension', 'tests', 'deploy', 'docs', 'package.json', 'package-lock.json', 'vite.config.js', 'Dockerfile', '.dockerignore', 'README.md']:
            tar.add(root / name, arcname=name)
    remote('install -d -m 700 /opt/afterword')
    subprocess.run(['scp', *ssh_options, str(archive), target + ':/opt/afterword/source.tar.gz'], check=True)
    remote('tar -xzf /opt/afterword/source.tar.gz -C /opt/afterword && rm /opt/afterword/source.tar.gz')
subprocess.run(['scp', *ssh_options, str(env_path), target + ':/opt/afterword/deploy/.env'], check=True)
remote('chmod 600 /opt/afterword/deploy/.env && cd /opt/afterword && docker compose -f deploy/compose.yaml up -d --build')
# Seed via stdin, never with passwords in shell arguments or console output.
seed = """import {createStore} from './server/store.mjs';
const store=createStore('/data/afterword.sqlite',process.env.ARCHIVE_KEY);
const input=REPLACE;
if(!store.userByName(input.username)) await store.createUser(input.username,input.password);
store.close(); console.log('Owner account initialized.');
""".replace('REPLACE', json.dumps({'username': values['owner_username'], 'password': values['owner_password']}))
remote('cd /opt/afterword && docker compose -f deploy/compose.yaml exec -T app node --input-type=module', input=seed)
caddy = state['hostname'] + ' {\n encode zstd gzip\n reverse_proxy 127.0.0.1:4318\n header Strict-Transport-Security "max-age=31536000"\n}\n'
remote('cat > /etc/caddy/Caddyfile && caddy validate --config /etc/caddy/Caddyfile && systemctl enable --now caddy && systemctl reload caddy', input=caddy)
remote('cd /opt/afterword && docker compose -f deploy/compose.yaml ps')
print('Deployed:', state['url'])
print('Owner credentials:', credentials)
