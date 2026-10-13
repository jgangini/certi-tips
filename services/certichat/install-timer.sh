#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0
refresh_minutes=$(python3 - <<'PY'
from pathlib import Path

path = Path('/opt/jarvis/apps/certichat/services/certichat/.env')
values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
value = values.get('CERTICHAT_INDEX_REFRESH_MINUTES', '5').strip().strip("'\"")
if not value.isascii() or not value.isdecimal() or not 1 <= int(value) <= 15:
    raise SystemExit('CERTICHAT_INDEX_REFRESH_MINUTES must be an integer from 1 to 15 minutes.')
print(int(value))
PY
)
cat >/etc/systemd/system/certichat-index.service <<'UNIT'
[Unit]
Description=Refresh published CertiTips knowledge for CertiChat
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=jarvisops
WorkingDirectory=/opt/jarvis/apps/certichat
ExecStart=/bin/bash /opt/jarvis/apps/certichat/services/certichat/sync-knowledge.sh
TimeoutStartSec=3h
UMask=0077
UNIT
cat >/etc/systemd/system/certichat-index.timer <<UNIT
[Unit]
Description=Check CertiTips knowledge for published changes

[Timer]
OnBootSec=${refresh_minutes}min
OnUnitActiveSec=${refresh_minutes}min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
cat >/etc/systemd/system/certichat-manifest.service <<'UNIT'
[Unit]
Description=Refresh CertiChat source validity while candidate indexing runs
After=docker.service network-online.target

[Service]
Type=oneshot
User=jarvisops
WorkingDirectory=/opt/jarvis/apps/certichat
ExecStart=/usr/bin/docker compose --project-directory /opt/jarvis/apps/certichat --env-file services/certichat/.env -p certichat -f services/certichat/compose.yml run --rm --no-deps indexer refresh
TimeoutStartSec=90
UMask=0077
UNIT
cat >/etc/systemd/system/certichat-manifest.timer <<UNIT
[Unit]
Description=Check the validity of CertiChat sources

[Timer]
OnBootSec=2min
OnUnitActiveSec=${refresh_minutes}min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable certichat-index.timer certichat-manifest.timer
systemctl restart certichat-index.timer certichat-manifest.timer
