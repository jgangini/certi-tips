#!/usr/bin/env bash
set -euo pipefail
caddyfile=/opt/jarvis/config/caddy/Caddyfile
container=jarvis-caddy
candidate="/tmp/certichat-caddy.$$.conf"
temporary=$(mktemp)
trap 'rm -f "$temporary"; docker exec "$container" rm -f "$candidate" >/dev/null 2>&1 || true' EXIT
test -f "$caddyfile"
awk '
  $0 == "# BEGIN certichat" { skip=1; next }
  $0 == "# END certichat" { skip=0; next }
  !skip { print }
  END { if (skip) exit 1 }
' "$caddyfile" > "$temporary"
cat >> "$temporary" <<'CADDY'

# BEGIN certichat
certichat.cloudtechnext.net {
  encode zstd gzip
  request_body {
    max_size 8KB
  }
  @public path /api/*
  handle @public {
    reverse_proxy 127.0.0.1:18741 {
      header_up X-Forwarded-For {remote_host}
      header_up X-Forwarded-Proto https
    }
  }
  handle {
    respond 404
  }
}
# END certichat
CADDY
docker cp "$temporary" "$container:$candidate" >/dev/null
docker exec "$container" caddy validate --adapter caddyfile --config "$candidate"
backup="${caddyfile}.certichat.$(date +%Y%m%d%H%M%S).bak"
cp -p "$caddyfile" "$backup"
chmod 600 "$backup"
cat "$temporary" > "$caddyfile"
if ! docker exec "$container" caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile; then
  cat "$backup" > "$caddyfile"
  docker exec "$container" caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
  exit 1
fi
echo "CertiChat HTTPS proxy active; previous configuration: $backup"
