#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0
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
cat >/etc/systemd/system/certichat-index.timer <<'UNIT'
[Unit]
Description=Check CertiTips knowledge every five minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
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
cat >/etc/systemd/system/certichat-manifest.timer <<'UNIT'
[Unit]
Description=Check the validity of CertiChat sources every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now certichat-index.timer certichat-manifest.timer
