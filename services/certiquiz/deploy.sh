#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/apps/certiquiz
umask 077
python3 - <<'PY'
import os
import secrets
from pathlib import Path

service = Path('services/certiquiz')
env = service / '.env'
if not env.exists():
    admin, runtime = (secrets.token_hex(32) for _ in range(2))
    values = {
        'CERTIQUIZ_POSTGRES_ADMIN_PASSWORD': admin,
        'CERTIQUIZ_POSTGRES_RUNTIME_PASSWORD': runtime,
        'CERTIQUIZ_DATABASE_URL': f'postgresql://certiquiz_runtime:{runtime}@postgres:5432/certiquiz',
        'CERTIQUIZ_PUBLIC_ORIGIN': 'https://certiquiz.cloudtechnext.net',
        'CERTIQUIZ_ALLOWED_ORIGINS': 'https://jgangini.github.io',
        'CERTIQUIZ_SECURE_COOKIES': 'true',
        'CERTIQUIZ_PORT': '18740',
        'CERTIQUIZ_TRUSTED_PROXY_IPS': '127.0.0.1',
        'CERTIQUIZ_CATALOG_SOURCE': 'github',
    }
    env.write_text(''.join(f"{name}='{value}'\n" for name, value in values.items()))
    os.chmod(env, 0o600)
    print('Created private CertiQuiz credentials. No credentials are included in release archives.')
if not any(line.startswith('CERTIQUIZ_ALLOWED_ORIGINS=') for line in env.read_text().splitlines()):
    with env.open('a') as settings:
        settings.write("\nCERTIQUIZ_ALLOWED_ORIGINS='https://jgangini.github.io'\n")
if not any(line.startswith('CERTIQUIZ_CATALOG_SOURCE=') for line in env.read_text().splitlines()):
    with env.open('a') as settings:
        settings.write("\nCERTIQUIZ_CATALOG_SOURCE=github\n")
PY
compose=(docker compose --project-directory "$PWD" --env-file services/certiquiz/.env -p certiquiz -f services/certiquiz/compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build api
"${compose[@]}" up -d --wait --wait-timeout 90 postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" create api
gateway=$(docker network inspect certiquiz_app --format '{{(index .IPAM.Config 0).Gateway}}')
python3 - "$gateway" <<'PY'
import ipaddress
import sys
from pathlib import Path
gateway = str(ipaddress.ip_address(sys.argv[1]))
env = Path('services/certiquiz/.env')
lines = [line for line in env.read_text().splitlines() if not line.startswith('CERTIQUIZ_TRUSTED_PROXY_IPS=')]
lines.append(f"CERTIQUIZ_TRUSTED_PROXY_IPS='{gateway}'")
env.write_text('\n'.join(lines) + '\n')
PY
"${compose[@]}" up -d --wait --wait-timeout 90 api
curl --fail --silent --show-error --connect-timeout 5 --max-time 10 http://127.0.0.1:18740/api/health
curl --fail --silent --show-error --connect-timeout 5 --max-time 15 https://cloudtechnext.net/api/health
case "${CERTIQUIZ_PUBLISH_PROXY:-true}" in
  true) sudo -n bash services/certiquiz/update-caddy.sh
        echo 'CertiQuiz API and proxy ready. Public HTTPS must be verified after DNS resolves.' ;;
  false) echo 'CertiQuiz API ready on loopback; publishing the proxy was deferred.' ;;
  *) echo 'CERTIQUIZ_PUBLISH_PROXY must be true or false.' >&2; exit 1 ;;
esac
