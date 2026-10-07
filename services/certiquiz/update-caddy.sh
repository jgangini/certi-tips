#!/usr/bin/env bash
set -euo pipefail
caddyfile=/opt/jarvis/config/caddy/Caddyfile
container=jarvis-caddy
candidate="/tmp/certiquiz-caddy.$$.conf"
temporary=$(mktemp)
trap 'rm -f "$temporary"; docker exec "$container" rm -f "$candidate" >/dev/null 2>&1 || true' EXIT
test -f "$caddyfile"
# Only replace this application's delimited block; CloudTechNext owns its own block.
awk '
  $0 == "# BEGIN certiquiz" { skip=1; next }
  $0 == "# END certiquiz" { skip=0; next }
  !skip { print }
  END { if (skip) exit 1 }
' "$caddyfile" > "$temporary"
cat >> "$temporary" <<'CADDY'

# BEGIN certiquiz
certiquiz.cloudtechnext.net {
  encode zstd gzip
  request_body {
    max_size 8KB
  }
  reverse_proxy 127.0.0.1:18740 {
    header_up X-Forwarded-For {remote_host}
    header_up X-Forwarded-Proto https
  }
}
# END certiquiz
CADDY
docker cp "$temporary" "$container:$candidate" >/dev/null
docker exec "$container" caddy validate --adapter caddyfile --config "$candidate"
backup="${caddyfile}.certiquiz.$(date +%Y%m%d%H%M%S).bak"
cp -p "$caddyfile" "$backup"
chmod 600 "$backup"
# Preserve the bind-mounted inode so the running proxy reads the updated file.
cat "$temporary" > "$caddyfile"
if ! docker exec "$container" caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile; then
  cat "$backup" > "$caddyfile"
  docker exec "$container" caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
  exit 1
fi
echo "CertiQuiz proxy active; previous configuration: $backup"
