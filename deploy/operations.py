#!/usr/bin/env python3
"""Inspect and configure Afterword's own DigitalOcean operating controls."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class DigitalOcean:
    def __init__(self, private=None):
        self.private = private or Path.home() / '.config' / 'afterword'
        self.state = json.loads((self.private / 'deployment.json').read_text())
        self.token = json.loads((self.private / 'digitalocean.json').read_text())['token']

    def request(self, method, path, body=None):
        request = Request('https://api.digitalocean.com/v2/' + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}, method=method)
        with urlopen(request, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw else {}

    def status(self):
        resource = 'droplets/' + str(self.state['droplet_id'])
        droplet = self.request('GET', resource)['droplet']
        if droplet['name'] != 'afterword-saas':
            raise RuntimeError('The recorded Droplet is not the Afterword server.')
        policy = self.request('GET', resource + '/backups/policy')['policy']
        backups = self.request('GET', resource + '/backups')['backups']
        return {'droplet': {k: droplet[k] for k in ['id', 'name', 'status', 'memory', 'disk']},
                'monthlyServerUSD': droplet['size']['price_monthly'], 'backupPolicy': policy,
                'backups': [{'id': b['id'], 'createdAt': b['created_at'], 'sizeGB': b.get('size_gigabytes')} for b in backups]}

    def enable_daily_backups(self, hour):
        current = self.status()
        policy = current['backupPolicy']
        if policy.get('backup_enabled'):
            # Do not replace an operator's existing policy without a separate request.
            return {'changed': False, 'reason': 'Backups already enabled', **current}
        action = self.request('POST', 'droplets/' + str(self.state['droplet_id']) + '/actions',
                              {'type': 'enable_backups', 'backup_policy': {'plan': 'daily', 'hour': hour}})['action']
        result = {'changed': True, 'actionId': action['id'], 'status': action['status'],
                  'monthlyBackupUSD': round(current['monthlyServerUSD'] * .3, 2), 'policy': {'plan': 'daily', 'hour': hour}}
        file = self.private / 'backup-enablement.json'
        file.write_text(json.dumps(result, indent=2)); file.chmod(0o600)
        return result

    def uptime_checks(self):
        checks, page = [], 1
        while True:
            response = self.request('GET', f'uptime/checks?per_page=200&page={page}')
            batch = response['checks']
            checks.extend(batch)
            if not response.get('links', {}).get('pages', {}).get('next'):
                return checks
            if not batch:
                raise RuntimeError('Uptime pagination returned an empty page with a next page.')
            page += 1

    def uptime_target(self):
        origin = self.state['url'].rstrip('/')
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or parsed.hostname != self.state['hostname'] or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise RuntimeError('The recorded Afterword URL must be its public HTTPS origin.')
        return origin + '/api/health'

    def afterword_check(self, checks):
        matches = [check for check in checks if check['name'] == 'Afterword availability' and check['target'] == self.uptime_target()]
        if len(matches) > 1:
            raise RuntimeError('Multiple Afterword availability checks exist; inspect them before changing monitoring.')
        return matches[0] if matches else None

    def enable_uptime(self):
        # Validate the deployment before creating a billable resource. Leave
        # other applications' checks and existing operator choices untouched.
        self.status()
        checks = self.uptime_checks()
        check = self.afterword_check(checks)
        created = check is None
        if created:
            check = self.request('POST', 'uptime/checks', {
                'enabled': True, 'name': 'Afterword availability',
                'regions': ['us_east', 'eu_west'],
                'target': self.uptime_target(), 'type': 'https',
            })['check']
        result = {'created': created, 'check': check, 'monthlyListPriceUSD': 1,
                  'otherAccountChecks': len(checks) - (0 if created else 1),
                  'notificationsConfiguredByThisCommand': False}
        file = self.private / 'uptime-enablement.json'
        file.write_text(json.dumps(result, indent=2)); file.chmod(0o600)
        return result

    def uptime_status(self):
        check = self.afterword_check(self.uptime_checks())
        if check is None:
            return {'configured': False}
        resource = 'uptime/checks/' + check['id']
        state = self.request('GET', resource + '/state')['state']
        alerts = self.request('GET', resource + '/alerts')['alerts']
        return {'configured': True, 'check': check, 'state': state,
                'alertCount': len(alerts)}

    def backup_status(self):
        options = ['-i', str(self.private / 'deploy_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
                   '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(self.private / 'known_hosts'), '-o', 'ConnectTimeout=15']
        script = """import {readFile,readdir} from 'node:fs/promises';
let status; try { status=JSON.parse(await readFile('/data/backup-status.json','utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; status={state:'not_recorded'}; }
const snapshots=(await readdir('/data/backups',{withFileTypes:true})).filter(e=>e.isDirectory() && /^\\d{4}-\\d{2}-\\d{2}T/.test(e.name)).map(e=>e.name).sort();
console.log(JSON.stringify({status,localSnapshots:snapshots.length,latestLocalSnapshot:snapshots.at(-1)}));
"""
        result = subprocess.run(['ssh', *options, 'root@' + self.state['ip'],
                                 'cd /opt/afterword && docker compose -f deploy/compose.yaml exec -T app node --input-type=module'],
                                input=script, text=True, capture_output=True, timeout=30, check=True)
        return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('status')
    commands.add_parser('enable-uptime')
    commands.add_parser('uptime-status')
    commands.add_parser('backup-status')
    backups = commands.add_parser('enable-daily-backups')
    backups.add_argument('--hour', type=int, choices=[0, 4, 8, 12, 16, 20], default=20)
    action = commands.add_parser('action')
    action.add_argument('id', type=int)
    args = parser.parse_args()
    client = DigitalOcean()
    if args.command == 'status': result = client.status()
    elif args.command == 'enable-daily-backups': result = client.enable_daily_backups(args.hour)
    elif args.command == 'enable-uptime': result = client.enable_uptime()
    elif args.command == 'uptime-status': result = client.uptime_status()
    elif args.command == 'backup-status': result = client.backup_status()
    else: result = client.request('GET', 'actions/' + str(args.id))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
