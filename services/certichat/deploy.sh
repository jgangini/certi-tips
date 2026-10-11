#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/apps/certichat
umask 077
python3 - <<'PY'
import os
import secrets
from pathlib import Path

env = Path('services/certichat/.env')
if not env.is_file() or env.is_symlink():
    raise SystemExit('Install OpenRouter and Turnstile secrets in the private service .env first.')
existing = dict(line.split('=', 1) for line in env.read_text().splitlines() if '=' in line and not line.startswith('#'))
for name in ('OPENROUTER_API_KEY', 'CERTICHAT_TURNSTILE_SECRET'):
    if not existing.get(name, '').strip("'\""):
        raise SystemExit(f'Missing required secret: {name}')
admin = existing.get('CERTICHAT_POSTGRES_ADMIN_PASSWORD', secrets.token_hex(32)).strip("'\"")
runtime = existing.get('CERTICHAT_POSTGRES_RUNTIME_PASSWORD', secrets.token_hex(32)).strip("'\"")
values = {
    'CERTICHAT_POSTGRES_ADMIN_PASSWORD': admin,
    'CERTICHAT_POSTGRES_RUNTIME_PASSWORD': runtime,
    'CERTICHAT_DATABASE_URL': f'postgresql://certichat_runtime:{runtime}@postgres:5432/certichat',
    'CERTICHAT_CHAT_INTERNAL_TOKEN': secrets.token_hex(32),
    'CERTICHAT_INDEX_INTERNAL_TOKEN': secrets.token_hex(32),
    'CERTICHAT_NETWORK_SECRET': secrets.token_hex(32),
    'CERTICHAT_PUBLIC_ORIGIN': 'https://certichat.cloudtechnext.net',
    'CERTICHAT_ALLOWED_ORIGINS': 'https://jgangini.github.io',
    'CERTICHAT_TURNSTILE_HOSTNAME': 'jgangini.github.io',
    'CERTICHAT_PORT': '18741', 'CERTICHAT_SECURE_COOKIES': 'true',
}
with env.open('a') as stream:
    stream.write('\n')
    for name, value in values.items():
        if name not in existing:
            stream.write(f"{name}='{value}'\n")
os.chmod(env, 0o600)
PY
compose=(docker compose --project-directory "$PWD" --env-file services/certichat/.env -p certichat -f services/certichat/compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build api knowledge
"${compose[@]}" up -d --wait --wait-timeout 90 postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" run --rm volume-init
"${compose[@]}" create api
gateway=$(docker network inspect certichat_app --format '{{(index .IPAM.Config 0).Gateway}}')
python3 - "$gateway" <<'PY'
import ipaddress
import sys
from pathlib import Path
gateway = str(ipaddress.ip_address(sys.argv[1]))
env = Path('services/certichat/.env')
lines = [line for line in env.read_text().splitlines() if not line.startswith('CERTICHAT_TRUSTED_PROXY_IPS=')]
lines.append(f"CERTICHAT_TRUSTED_PROXY_IPS='{gateway}'")
env.write_text('\n'.join(lines) + '\n')
PY
"${compose[@]}" up -d --wait --wait-timeout 180 api knowledge
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:18741/api/health
sudo -n bash services/certichat/install-timer.sh
if [[ "${CERTICHAT_PUBLISH_PROXY:-true}" == true ]]; then
  sudo -n bash services/certichat/update-caddy.sh
fi
echo 'CertiChat deployed; indexing checks the published Pages manifest every five minutes.'
