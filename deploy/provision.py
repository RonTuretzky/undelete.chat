#!/usr/bin/env python3
"""Provision one dedicated Afterword VM. Credentials remain outside the project."""
import json, pathlib, subprocess, urllib.request, urllib.error
private = pathlib.Path.home() / '.config' / 'afterword'
private.mkdir(parents=True, exist_ok=True, mode=0o700)
token = json.loads((private / 'digitalocean.json').read_text())['token']
def request(method, endpoint, payload=None):
    req = urllib.request.Request('https://api.digitalocean.com/v2/' + endpoint,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)
state_path = private / 'deployment.json'
if state_path.exists():
    state = json.loads(state_path.read_text())
    droplet = request('GET', f"droplets/{state['droplet_id']}")['droplet']
else:
    key = private / 'deploy_ed25519'
    if not key.exists():
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(key), '-C', 'afterword-deploy'], check=True)
    pub = (private / 'deploy_ed25519.pub').read_text().strip()
    keys = request('GET', 'account/keys')['ssh_keys']
    match = next((k for k in keys if k['public_key'].split()[:2] == pub.split()[:2]), None)
    if not match:
        match = request('POST', 'account/keys', {'name': 'afterword-deploy', 'public_key': pub})['ssh_key']
    # Check the name before creating to make interrupted calls safe to resume.
    existing = request('GET', 'droplets?per_page=200')['droplets']
    droplet = next((d for d in existing if d['name'] == 'afterword-saas'), None)
    if not droplet:
        cloud = '''#cloud-config
package_update: true
ssh_pwauth: false
packages: [docker.io, docker-compose-v2, caddy, ufw]
runcmd:
  - [systemctl, enable, --now, docker]
  - [ufw, allow, OpenSSH]
  - [ufw, allow, 80/tcp]
  - [ufw, allow, 443/tcp]
  - [ufw, --force, enable]
  - [fallocate, -l, 2G, /swapfile]
  - [chmod, '600', /swapfile]
  - [mkswap, /swapfile]
  - [swapon, /swapfile]
  - [sh, -c, "echo '/swapfile none swap sw 0 0' >> /etc/fstab"]
'''
        droplet = request('POST', 'droplets', {'name': 'afterword-saas', 'region': 'nyc3', 'size': 's-1vcpu-1gb',
            'image': 'ubuntu-24-04-x64', 'ssh_keys': [match['id']], 'backups': False, 'ipv6': True,
            'monitoring': True, 'tags': ['afterword'], 'user_data': cloud})['droplet']
    state = {'droplet_id': droplet['id'], 'region': 'nyc3', 'size': 's-1vcpu-1gb', 'monthly_usd': 6}
    state_path.write_text(json.dumps(state, indent=2)); state_path.chmod(0o600)
ips = [n['ip_address'] for n in droplet['networks']['v4'] if n['type'] == 'public']
if ips:
    state['ip'] = ips[0]
    state['hostname'] = 'afterword-' + ips[0].replace('.', '-') + '.sslip.io'
    state['url'] = 'https://' + state['hostname']
    state_path.write_text(json.dumps(state, indent=2)); state_path.chmod(0o600)
print(json.dumps({'status': droplet['status'], **state}, indent=2))
