param(
    [string]$SshHost = '187.77.63.10',
    [string]$User = 'jarvisops',
    [string]$KeyPath = "$env:USERPROFILE\.ssh\hostinger_multica_ed25519",
    [switch]$SkipProxy
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$scp = Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$id = [guid]::NewGuid().ToString('N')
$archive = Join-Path ([IO.Path]::GetTempPath()) "certiquiz-$id.tar.gz"
$remoteArchive = "/tmp/certiquiz-$id.tar.gz"
$target = "$User@$SshHost"
$options = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')

function Invoke-Checked([scriptblock]$Action) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "CertiQuiz operation failed ($LASTEXITCODE)." }
}

$catalog = Get-Content -LiteralPath (Join-Path $repo 'data/catalog.json') -Raw | ConvertFrom-Json
$banks = @($catalog.courses | ForEach-Object {
    if ($_.questionBank -notmatch '^[a-z0-9-]+$') { throw 'Invalid question bank filename.' }
    "data/$($_.questionBank).json"
} | Select-Object -Unique)
# Explicit source roots and exclusions keep production credentials and unrelated work out of the release.
Invoke-Checked { & tar -czf $archive -C $repo --exclude=.env --exclude='.env.*' --exclude=.private --exclude=__pycache__ --exclude=.pytest_cache services/certiquiz data/catalog.json @banks }
$entries = & tar -tzf $archive
if ($LASTEXITCODE -ne 0 -or ($entries | Where-Object { $_ -match '(^|/)(\.env[^/]*|\.private|\.\.)($|/)' -or $_ -notmatch '^(services/certiquiz/|data/)' })) { throw 'Release archive contains an unexpected path.' }
Invoke-Checked { & $scp @options $archive "${target}:$remoteArchive" }
$remote = @'
set -euo pipefail
app=/opt/jarvis/apps/certiquiz
archive=__ARCHIVE__
stage=/opt/jarvis/apps/.certiquiz-stage-__ID__
backup=/opt/jarvis/backups/certiquiz/release-__ID__
failed=/opt/jarvis/backups/certiquiz/failed-__ID__
rollback_tag=certiquiz-api:rollback-__ID__
old_ref=''
promoted=false
had_previous=false
umask 077
mkdir -p /opt/jarvis/backups/certiquiz
chmod 700 /opt/jarvis/backups/certiquiz
exec 9>/opt/jarvis/backups/certiquiz/deploy.lock
flock -n 9 || { echo 'Another CertiQuiz deployment is running.' >&2; exit 1; }
[[ ! -L "$app" && ! -e "$stage" && ! -e "$backup" && ! -e "$failed" ]]

recover() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$promoted" = true ]; then
    set +e
    docker compose --project-directory "$app" --env-file "$app/services/certiquiz/.env" -p certiquiz \
      -f "$app/services/certiquiz/compose.yml" stop api >/dev/null 2>&1
    if [ "$had_previous" = true ]; then
      if mv "$app" "$failed" && mv "$backup" "$app"; then
        if [ -n "$old_ref" ]; then
          # ponytail: schema changes are additive; destructive migrations need explicit data recovery.
          if docker tag "$rollback_tag" "$old_ref" &&
             docker compose --project-directory "$app" --env-file "$app/services/certiquiz/.env" -p certiquiz \
               -f "$app/services/certiquiz/compose.yml" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 90 api &&
             curl --fail --silent --show-error --connect-timeout 5 --max-time 10 http://127.0.0.1:18740/api/health; then
            echo 'Previous CertiQuiz API restored. Database was not reverted.' >&2
          else
            echo "ROLLBACK FAILED: source restored; preserved candidate at $failed and image $rollback_tag." >&2
          fi
        fi
      else
        echo "ROLLBACK FAILED: inspect $app, $backup and $failed; no release was deleted." >&2
      fi
    else
      echo "Initial deployment failed; private setup retained at $app for retry. API stopped; PostgreSQL data retained." >&2
    fi
  elif [ "$status" -ne 0 ] && [ "$had_previous" = true ] && [ ! -e "$app" ] && [ -d "$backup" ]; then
    mv "$backup" "$app" || echo "Source recovery failed; previous release remains at $backup." >&2
  fi
  rm -f "$archive" || true
  exit "$status"
}
trap recover EXIT
mkdir "$stage"
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$stage"
python3 - "$stage" <<'PY'
import sys
from pathlib import Path
for script in (Path(sys.argv[1]) / 'services/certiquiz').glob('*.sh'):
    script.write_bytes(script.read_bytes().replace(bytes([13, 10]), bytes([10])))
PY
bash -n "$stage/services/certiquiz/deploy.sh"
bash -n "$stage/services/certiquiz/update-caddy.sh"
if [ -d "$app" ]; then
  [[ -f "$app/services/certiquiz/.env" && ! -L "$app/services/certiquiz/.env" ]]
  cp -p "$app/services/certiquiz/.env" "$stage/services/certiquiz/.env"
  chmod 600 "$stage/services/certiquiz/.env"
  if [ -d "$app/services/certiquiz/.private" ]; then
    [[ ! -L "$app/services/certiquiz/.private" ]]
    cp -a "$app/services/certiquiz/.private" "$stage/services/certiquiz/.private"
    chmod -R go-rwx "$stage/services/certiquiz/.private"
  fi
  old_api=$(docker ps -aq --filter label=com.docker.compose.project=certiquiz --filter label=com.docker.compose.service=api)
  if [ -n "$old_api" ]; then
    old_ref=$(docker inspect --format '{{.Config.Image}}' "$old_api")
    [[ "$old_ref" == certiquiz-api:* ]]
    docker tag "$(docker inspect --format '{{.Image}}' "$old_api")" "$rollback_tag"
  fi
  old_compose=(docker compose --project-directory "$app" --env-file "$app/services/certiquiz/.env" -p certiquiz -f "$app/services/certiquiz/compose.yml")
  "${old_compose[@]}" up -d --wait --wait-timeout 90 postgres
  "${old_compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' </dev/null > "$stage/.predeploy.dump"
  test -s "$stage/.predeploy.dump"
  "${old_compose[@]}" exec -T postgres pg_restore --list < "$stage/.predeploy.dump" >/dev/null
  chmod 700 "$app"
  had_previous=true
  mv "$app" "$backup"
fi
if ! mv "$stage" "$app"; then
  if [ "$had_previous" = true ]; then mv "$backup" "$app"; fi
  exit 1
fi
promoted=true
if [ "$had_previous" = true ]; then mv "$app/.predeploy.dump" "$backup/certiquiz.dump"; fi
CERTIQUIZ_PUBLISH_PROXY=__PUBLISH_PROXY__ bash "$app/services/certiquiz/deploy.sh" </dev/null
if [ "$had_previous" = true ]; then
  echo "CertiQuiz release completed. Previous release preserved at $backup"
else
  echo 'Initial CertiQuiz release completed.'
fi
'@
$remote = $remote.Replace('__ARCHIVE__', $remoteArchive).Replace('__ID__', $id).Replace('__PUBLISH_PROXY__', $(if ($SkipProxy) { 'false' } else { 'true' })).Replace("`r", '')
Invoke-Checked { $remote | & $ssh @options $target 'tr -d "\r" | bash -s' }
Remove-Item -LiteralPath $archive
Write-Output 'CertiQuiz API deployed; hosts create rooms without an access key.'
