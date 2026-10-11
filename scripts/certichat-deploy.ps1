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
$archive = Join-Path ([IO.Path]::GetTempPath()) "certichat-$id.tar.gz"
$remoteArchive = "/tmp/certichat-$id.tar.gz"
$target = "$User@$SshHost"
$options = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')

function Invoke-Checked([scriptblock]$Action) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "CertiChat operation failed ($LASTEXITCODE)." }
}

# Explicit source roots and exclusions keep production credentials and unrelated work out of the release.
Invoke-Checked { & tar -czf $archive -C $repo --exclude=.env --exclude='.env.*' --exclude=.private --exclude=__pycache__ --exclude=.pytest_cache services/certichat }
$entries = & tar -tzf $archive
if ($LASTEXITCODE -ne 0 -or ($entries | Where-Object { $_ -match '(^|/)(\.env[^/]*|\.private|\.\.)($|/)' -or $_ -notmatch '^services/certichat/' })) { throw 'Release archive contains an unexpected path.' }
Invoke-Checked { & $scp @options $archive "${target}:$remoteArchive" }
$remote = @'
set -euo pipefail
app=/opt/jarvis/apps/certichat
archive=__ARCHIVE__
stage=/opt/jarvis/apps/.certichat-stage-__ID__
backup=/opt/jarvis/backups/certichat/release-__ID__
failed=/opt/jarvis/backups/certichat/failed-__ID__
rollback_tag=certichat-api:rollback-__ID__
old_ref=''
old_knowledge_ref=''
rollback_knowledge_tag=certichat-knowledge:rollback-__ID__
promoted=false
had_previous=false
umask 077
mkdir -p /opt/jarvis/backups/certichat
chmod 700 /opt/jarvis/backups/certichat
exec 9>/opt/jarvis/backups/certichat/deploy.lock
flock -n 9 || { echo 'Another CertiChat deployment is running.' >&2; exit 1; }
[[ ! -L "$app" && ! -e "$stage" && ! -e "$backup" && ! -e "$failed" ]]

recover() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$promoted" = true ]; then
    set +e
    docker compose --project-directory "$app" --env-file "$app/services/certichat/.env" -p certichat \
      -f "$app/services/certichat/compose.yml" stop -t 55 api knowledge >/dev/null 2>&1
    if [ "$had_previous" = true ]; then
      if mv "$app" "$failed" && mv "$backup" "$app"; then
        if [ -n "$old_ref" ]; then
          if [ -n "$old_knowledge_ref" ]; then docker tag "$rollback_knowledge_tag" "$old_knowledge_ref"; fi
          # ponytail: schema changes are additive; destructive migrations need explicit data recovery.
          if docker tag "$rollback_tag" "$old_ref" &&
             docker compose --project-directory "$app" --env-file "$app/services/certichat/.env" -p certichat \
               -f "$app/services/certichat/compose.yml" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 api knowledge &&
             curl --fail --silent --show-error --connect-timeout 5 --max-time 10 http://127.0.0.1:18741/api/health; then
            echo 'Previous CertiChat API restored. Database was not reverted.' >&2
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
for script in (Path(sys.argv[1]) / 'services/certichat').glob('*.sh'):
    script.write_bytes(script.read_bytes().replace(bytes([13, 10]), bytes([10])))
PY
bash -n "$stage/services/certichat/deploy.sh"
bash -n "$stage/services/certichat/update-caddy.sh"
bash -n "$stage/services/certichat/sync-knowledge.sh"
bash -n "$stage/services/certichat/install-timer.sh"
if [ -d "$app" ]; then
  [[ -f "$app/services/certichat/.env" && ! -L "$app/services/certichat/.env" ]]
  cp -p "$app/services/certichat/.env" "$stage/services/certichat/.env"
  chmod 600 "$stage/services/certichat/.env"
  if [ -d "$app/services/certichat/.private" ]; then
    [[ ! -L "$app/services/certichat/.private" ]]
    cp -a "$app/services/certichat/.private" "$stage/services/certichat/.private"
    chmod -R go-rwx "$stage/services/certichat/.private"
  fi
  old_api=$(docker ps -aq --filter label=com.docker.compose.project=certichat --filter label=com.docker.compose.service=api)
  if [ -n "$old_api" ]; then
    old_ref=$(docker inspect --format '{{.Config.Image}}' "$old_api")
    [[ "$old_ref" == certichat-api:* ]]
    docker tag "$(docker inspect --format '{{.Image}}' "$old_api")" "$rollback_tag"
  fi
  old_knowledge=$(docker ps -aq --filter label=com.docker.compose.project=certichat --filter label=com.docker.compose.service=knowledge)
  if [ -n "$old_knowledge" ]; then
    old_knowledge_ref=$(docker inspect --format '{{.Config.Image}}' "$old_knowledge")
    [[ "$old_knowledge_ref" == certichat-knowledge:* ]]
    docker tag "$(docker inspect --format '{{.Image}}' "$old_knowledge")" "$rollback_knowledge_tag"
  fi
  if [ -f "$app/services/certichat/compose.yml" ]; then
  old_compose=(docker compose --project-directory "$app" --env-file "$app/services/certichat/.env" -p certichat -f "$app/services/certichat/compose.yml")
  "${old_compose[@]}" up -d --wait --wait-timeout 90 postgres
  "${old_compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' </dev/null > "$stage/.predeploy.dump"
  test -s "$stage/.predeploy.dump"
  "${old_compose[@]}" exec -T postgres pg_restore --list < "$stage/.predeploy.dump" >/dev/null
  chmod 700 "$app"
  had_previous=true
  fi
  mv "$app" "$backup"
fi
if ! mv "$stage" "$app"; then
  if [ "$had_previous" = true ]; then mv "$backup" "$app"; fi
  exit 1
fi
promoted=true
if [ "$had_previous" = true ]; then mv "$app/.predeploy.dump" "$backup/certichat.dump"; fi
CERTICHAT_PUBLISH_PROXY=__PUBLISH_PROXY__ bash "$app/services/certichat/deploy.sh" </dev/null
if [ "$had_previous" = true ]; then
  echo "CertiChat release completed. Previous release preserved at $backup"
else
  echo 'Initial CertiChat release completed.'
fi
'@
$remote = $remote.Replace('__ARCHIVE__', $remoteArchive).Replace('__ID__', $id).Replace('__PUBLISH_PROXY__', $(if ($SkipProxy) { 'false' } else { 'true' })).Replace("`r", '')
Invoke-Checked { $remote | & $ssh @options $target 'tr -d "\r" | bash -s' }
Remove-Item -LiteralPath $archive
Write-Output 'CertiChat deployed; public content synchronization uses the systemd timer.'
