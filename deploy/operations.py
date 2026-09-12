#!/usr/bin/env python3
"""Inspect and configure Undelete's own DigitalOcean operating controls."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError


class DigitalOcean:
    def __init__(self, private=None):
        self.private = private or Path.home() / '.config' / 'afterword'
        self.state = json.loads((self.private / 'deployment.json').read_text())
        self.token = json.loads((self.private / 'digitalocean.json').read_text())['token']

    def request(self, method, path, body=None):
        request = Request('https://api.digitalocean.com/v2/' + path,
                          data=json.dumps(body).encode() if body is not None else None,
                          headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}, method=method)
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as error:
            detail = error.read(2048).decode('utf-8', 'replace')
            raise RuntimeError(f'DigitalOcean {method} {path} failed with HTTP {error.code}: {detail}') from None
        return json.loads(raw) if raw else {}

    def status(self):
        resource = 'droplets/' + str(self.state['droplet_id'])
        droplet = self.request('GET', resource)['droplet']
        if droplet['name'] != 'afterword-saas':
            raise RuntimeError('The recorded Droplet is not the Undelete server.')
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

    def uptime_target(self, path='/api/health'):
        origin = self.state['url'].rstrip('/')
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or parsed.hostname != self.state['hostname'] or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise RuntimeError('The recorded Undelete URL must be its public HTTPS origin.')
        if path not in ('/api/health', '/api/monitor'):
            raise RuntimeError('Unknown Undelete monitoring endpoint.')
        return origin + path

    def afterword_check(self, checks):
        targets = {self.uptime_target(), self.uptime_target('/api/monitor')}
        matches = [check for check in checks if check['name'] in ('Undelete availability', 'Undelete availability') and check['target'] in targets]
        if len(matches) > 1:
            raise RuntimeError('Multiple Undelete availability checks exist; inspect them before changing monitoring.')
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
                'enabled': True, 'name': 'Undelete availability',
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

    def probe_service_monitor(self):
        target = self.uptime_target('/api/monitor')
        try:
            response = urlopen(Request(target, headers={'Accept': 'application/json'}), timeout=15)
        except HTTPError as error:
            if error.code != 503:
                raise
            response = error
        with response:
            body = response.read(1024)
            status = response.code
            if response.geturl() != target or not response.headers.get('Content-Type', '').startswith('application/json'):
                raise RuntimeError('The service monitor endpoint did not return its expected response.')
        try:
            value = json.loads(body)
        except ValueError:
            raise RuntimeError('The service monitor endpoint did not return JSON.') from None
        if type(value.get('ok')) is not bool or value != {'ok': value['ok'], 'service': 'afterword'} or status != (200 if value['ok'] else 503):
            raise RuntimeError('The service monitor response failed validation.')
        return value

    def enable_service_monitor(self):
        self.status()
        check = self.afterword_check(self.uptime_checks())
        if check is None:
            raise RuntimeError('Configure the Undelete availability check first.')
        probe = self.probe_service_monitor()
        target = self.uptime_target('/api/monitor')
        changed = check['target'] != target
        if changed:
            # Preserve regions, disabled state, name, and the existing check ID.
            # Its existing alerts are untouched; no notification is created.
            settings = {key: check[key] for key in ('name', 'type', 'regions', 'enabled')}
            settings['target'] = target
            check = self.request('PUT', 'uptime/checks/' + check['id'], settings)['check']
        result = {'changed': changed, 'check': check, 'probe': probe, 'notificationsConfiguredByThisCommand': False}
        file = self.private / 'service-monitor-enablement.json'
        file.write_text(json.dumps(result, indent=2)); file.chmod(0o600)
        return result

    def alert_email(self, override=None):
        if override:
            return override
        account = self.request('GET', 'account')['account']
        if not account.get('email_verified') or not account.get('email'):
            raise RuntimeError('The DigitalOcean account email is not verified; pass --email explicitly.')
        return account['email']

    droplet_alerts = (
        ('Undelete disk utilization', 'v1/insights/droplet/disk_utilization_percent', 85),
        ('Undelete memory utilization', 'v1/insights/droplet/memory_utilization_percent', 90),
    )

    def enable_alerts(self, email=None):
        """Idempotently attach operator notifications to the existing monitoring resources."""
        self.status()
        recipient = self.alert_email(email)
        check = self.afterword_check(self.uptime_checks())
        if check is None:
            raise RuntimeError('Configure the Undelete availability check first.')
        resource = 'uptime/checks/' + check['id']
        existing = self.request('GET', resource + '/alerts')['alerts']
        wanted = [
            {'name': 'Undelete down', 'type': 'down_global', 'period': '2m', 'comparison': 'less_than', 'threshold': 0},
            {'name': 'Undelete certificate expiry', 'type': 'ssl_expiry', 'threshold': 14, 'comparison': 'less_than', 'period': '2m'},
        ]
        uptime = []
        for alert in wanted:
            match = next((a for a in existing if a['type'] == alert['type']), None)
            if match is None:
                match = self.request('POST', resource + '/alerts', {**alert, 'notifications': {'email': [recipient], 'slack': []}})['alert']
                uptime.append({'created': True, 'id': match['id'], 'type': match['type']})
            else:
                # Preserve the operator's existing alert and any additional recipients.
                uptime.append({'created': False, 'id': match['id'], 'type': match['type'],
                               'notifiesRecipient': recipient in match.get('notifications', {}).get('email', [])})
        droplet_id = str(self.state['droplet_id'])
        policies = self.alert_policies()
        droplet = []
        for description, kind, value in self.droplet_alerts:
            match = next((p for p in policies if p['type'] == kind and droplet_id in [str(e) for e in p.get('entities', [])]), None)
            if match is None:
                match = self.request('POST', 'monitoring/alerts', {
                    'alerts': {'email': [recipient], 'slack': []}, 'compare': 'GreaterThan', 'description': description,
                    'enabled': True, 'entities': [droplet_id], 'tags': [], 'type': kind, 'value': value, 'window': '5m'})['policy']
                droplet.append({'created': True, 'uuid': match['uuid'], 'type': kind, 'value': value})
            else:
                droplet.append({'created': False, 'uuid': match['uuid'], 'type': kind, 'value': match.get('value'),
                                'enabled': match.get('enabled'), 'notifiesRecipient': recipient in match.get('alerts', {}).get('email', [])})
        result = {'recipient': recipient, 'uptimeAlerts': uptime, 'dropletAlerts': droplet,
                  'deliveryVerified': False}
        file = self.private / 'alert-enablement.json'
        file.write_text(json.dumps(result, indent=2)); file.chmod(0o600)
        return result

    def alert_status(self):
        check = self.afterword_check(self.uptime_checks())
        alerts = self.request('GET', 'uptime/checks/' + check['id'] + '/alerts')['alerts'] if check else []
        droplet_id = str(self.state['droplet_id'])
        policies = [p for p in self.alert_policies()
                    if droplet_id in [str(e) for e in p.get('entities', [])]]
        return {'uptimeAlerts': [{'id': a['id'], 'name': a['name'], 'type': a['type'], 'threshold': a.get('threshold'),
                                  'period': a.get('period'), 'recipients': len(a.get('notifications', {}).get('email', []))} for a in alerts],
                'dropletAlerts': [{'uuid': p['uuid'], 'type': p['type'], 'value': p['value'], 'window': p['window'], 'enabled': p['enabled'],
                                   'recipients': len(p.get('alerts', {}).get('email', []))} for p in policies]}

    def wait_action(self, action_id, timeout=900):
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            action = self.request('GET', 'actions/' + str(action_id))['action']
            if action['status'] == 'completed': return action
            if action['status'] == 'errored': raise RuntimeError(f"DigitalOcean action {action['type']} failed.")
            time.sleep(5)
        raise RuntimeError('Timed out waiting for the DigitalOcean action.')

    def wait_status(self, wanted, timeout=300):
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            droplet = self.request('GET', 'droplets/' + str(self.state['droplet_id']))['droplet']
            if droplet['status'] == wanted: return droplet
            time.sleep(5)
        raise RuntimeError(f'Timed out waiting for the Droplet to be {wanted}.')

    def resize(self, size, disk):
        """Resize the Undelete Droplet: graceful shutdown, resize, power on. A disk resize is permanent."""
        import time
        current = self.status()
        droplet = self.request('GET', 'droplets/' + str(self.state['droplet_id']))['droplet']
        if droplet['size_slug'] == size:
            return {'changed': False, 'reason': 'Already this size', 'size': size}
        sizes = {s['slug']: s for s in self.request('GET', 'sizes?per_page=200')['sizes']}
        target = sizes.get(size)
        if not target or not target['available'] or droplet['region']['slug'] not in target['regions']:
            raise RuntimeError('That size is not available in the Droplet region.')
        if disk and target['disk'] < droplet['disk']:
            raise RuntimeError('A disk resize cannot shrink the disk.')
        actions = 'droplets/' + str(self.state['droplet_id']) + '/actions'
        started = time.time()
        if droplet['status'] != 'off':
            # Graceful ACPI shutdown lets the application checkpoint sessions; fall back to power off.
            self.request('POST', actions, {'type': 'shutdown'})
            try: self.wait_status('off', timeout=150)
            except RuntimeError:
                self.wait_action(self.request('POST', actions, {'type': 'power_off'})['action']['id'])
                self.wait_status('off', timeout=120)
        resized = self.request('POST', actions, {'type': 'resize', 'size': size, 'disk': bool(disk)})['action']
        self.wait_action(resized['id'], timeout=1800)
        self.wait_action(self.request('POST', actions, {'type': 'power_on'})['action']['id'])
        droplet = self.wait_status('active')
        result = {'changed': True, 'from': current['droplet'], 'size': droplet['size_slug'], 'memoryMB': droplet['memory'], 'vcpus': droplet['vcpus'],
                  'diskGB': droplet['disk'], 'diskResized': bool(disk), 'monthlyServerUSD': droplet['size']['price_monthly'],
                  'downtimeSeconds': round(time.time() - started), 'resizeActionId': resized['id']}
        file = self.private / ('resize-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '.json')
        file.write_text(json.dumps(result, indent=2)); file.chmod(0o600)
        return result

    def alert_policies(self):
        policies, page = [], 1
        while True:
            response = self.request('GET', f'monitoring/alerts?per_page=200&page={page}')
            batch = response.get('policies', [])
            policies.extend(batch)
            if not response.get('links', {}).get('pages', {}).get('next') or not batch:
                return policies
            page += 1

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

    def service_status(self):
        options = ['-i', str(self.private / 'deploy_ed25519'), '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
                   '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(self.private / 'known_hosts'), '-o', 'ConnectTimeout=15']
        result = subprocess.run(['ssh', *options, 'root@' + self.state['ip'],
                                 'cd /opt/afterword && docker compose -f deploy/compose.yaml exec -T app node server/monitor.mjs status'],
                                text=True, capture_output=True, timeout=30, check=True)
        return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('status')
    commands.add_parser('enable-uptime')
    commands.add_parser('uptime-status')
    commands.add_parser('backup-status')
    commands.add_parser('service-status')
    commands.add_parser('enable-service-monitor')
    alerts = commands.add_parser('enable-alerts')
    alerts.add_argument('--email', help='Notification recipient; defaults to the verified DigitalOcean account email.')
    commands.add_parser('alert-status')
    resize = commands.add_parser('resize', help='Resize the Droplet with a graceful shutdown; a disk resize is permanent.')
    resize.add_argument('--size', required=True)
    resize.add_argument('--disk', action='store_true', help='Also grow the disk (irreversible).')
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
    elif args.command == 'service-status': result = client.service_status()
    elif args.command == 'enable-service-monitor': result = client.enable_service_monitor()
    elif args.command == 'enable-alerts': result = client.enable_alerts(args.email)
    elif args.command == 'alert-status': result = client.alert_status()
    elif args.command == 'resize': result = client.resize(args.size, args.disk)
    else: result = client.request('GET', 'actions/' + str(args.id))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
