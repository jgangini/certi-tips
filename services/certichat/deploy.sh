#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/apps/certichat
umask 077
python3 - <<'PY'
import os
import secrets
from decimal import Decimal
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
}
production = {
    'CERTICHAT_MODE': 'VPS',
    'CERTICHAT_PUBLIC_ORIGIN': 'https://certichat.cloudtechnext.net',
    'CERTICHAT_ALLOWED_ORIGINS': 'https://jgangini.github.io',
    'CERTICHAT_TURNSTILE_HOSTNAME': 'jgangini.github.io',
    'CERTICHAT_PORT': '18741', 'CERTICHAT_SECURE_COOKIES': 'true',
}
for name, default, maximum in (('CERTICHAT_REFRESH', '6', 24), ('CERTICHAT_QUESTIONS', '20', 100),
                               ('CERTICHAT_INDEX_REFRESH_MINUTES', '5', 15)):
    value = os.environ.get(name, existing.get(name, default)).strip("'\"")
    if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= maximum:
        raise SystemExit(f'{name} must be an integer from 1 to {maximum}.')
    production[name] = str(int(value))
for name, default in (('CERTICHAT_INDEX_BUDGET_USD', '10'), ('CERTICHAT_CHAT_BUDGET_USD', '10')):
    value = Decimal(os.environ.get(name, existing.get(name, default)).strip("'\""))
    if not value.is_finite() or not 0 < value <= 1000000 or value.normalize().as_tuple().exponent < -2:
        raise SystemExit(f'{name} must be a positive USD amount up to 1000000 with at most two decimal places.')
    production[name] = format(value, 'f')
for name, default in (('CERTICHAT_INDEX_MODEL', 'anthropic/claude-haiku-5.5'),
                      ('CERTICHAT_CHAT_MODEL', 'openai/gpt-5.4'),
                      ('CERTICHAT_INDEX_REASONING', 'high'), ('CERTICHAT_CHAT_REASONING', 'medium'),
                      ('CERTICHAT_INDEX_MAX_TOKENS', '16384'), ('CERTICHAT_CHAT_MAX_TOKENS', '8192'),
                      ('CERTICHAT_DATA_DIR', '/data/claude55-haiku')):
    value = os.environ.get(name, existing.get(name, default)).strip("'\"")
    if any(char not in 'abcdefghijklmnopqrstuvwxyz0123456789/._-' for char in value) or not value:
        raise SystemExit(f'Invalid model/index setting: {name}')
    production[name] = value
lines = [line for line in env.read_text().splitlines() if line.split('=', 1)[0].strip() not in production]
lines.extend(f"{name}='{value}'" for name, value in values.items() if name not in existing)
lines.extend(f"{name}='{value}'" for name, value in production.items())
env.write_text('\n'.join(lines) + '\n')
os.chmod(env, 0o600)
PY
# Compose prioritizes the process environment over --env-file: pin both to production.
export CERTICHAT_MODE=VPS CERTICHAT_PUBLIC_ORIGIN=https://certichat.cloudtechnext.net
export CERTICHAT_ALLOWED_ORIGINS=https://jgangini.github.io CERTICHAT_TURNSTILE_HOSTNAME=jgangini.github.io
export CERTICHAT_SECURE_COOKIES=true CERTICHAT_PORT=18741
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
echo 'CertiChat deployed; synchronization uses CERTICHAT_INDEX_REFRESH_MINUTES from the private service .env.'
