param(
    [string]$SshHost = '187.77.63.10',
    [string]$User = 'jarvisops',
    [string]$KeyPath = "$env:USERPROFILE\.ssh\hostinger_multica_ed25519",
    [switch]$SkipProxy,
    [string]$SourceRoot
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$releaseRoot = if ($SourceRoot) { (Resolve-Path -LiteralPath $SourceRoot).Path } else { $repo }
$ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$scp = Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
$id = [guid]::NewGuid().ToString('N')
$archive = Join-Path ([IO.Path]::GetTempPath()) "certichat-$id.tar.gz"
$remoteArchive = "/tmp/certichat-$id.tar.gz"
$target = "$User@$SshHost"
$options = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')
$parameters = @{ CERTICHAT_REFRESH = '6'; CERTICHAT_QUESTIONS = '20'; CERTICHAT_INDEX_REFRESH_MINUTES = '5'; CERTICHAT_INDEX_BUDGET_USD = '10'; CERTICHAT_CHAT_BUDGET_USD = '10'; CERTICHAT_INDEX_MODEL = 'anthropic/claude-haiku-5.5'; CERTICHAT_CHAT_MODEL = 'openai/gpt-5.4'; CERTICHAT_INDEX_REASONING = 'high'; CERTICHAT_CHAT_REASONING = 'medium'; CERTICHAT_INDEX_MAX_TOKENS = '16384'; CERTICHAT_CHAT_MAX_TOKENS = '8192'; CERTICHAT_DATA_DIR = '/data/claude55-haiku' }
$maximums = @{ CERTICHAT_REFRESH = 24; CERTICHAT_QUESTIONS = 100; CERTICHAT_INDEX_REFRESH_MINUTES = 15; CERTICHAT_INDEX_MAX_TOKENS = 16384; CERTICHAT_CHAT_MAX_TOKENS = 8192 }
$parameters['CERTICHAT_JEV_VIDEO_ENABLED'] = 'false'
$parameters['CERTICHAT_VOICE_ENABLED'] = 'false'
$parameters['CERTICHAT_VOICE_MODEL'] = 'openai/gpt-audio-mini'
$parameters['CERTICHAT_VOICE_PILOT_BUDGET_USD'] = '4.58'
$privateFile = Join-Path $repo '.private/certichat.env'
if (Test-Path -LiteralPath $privateFile) {
    foreach ($line in [IO.File]::ReadAllLines($privateFile)) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $parameters.ContainsKey($Matches[1])) {
            $name, $value = $Matches[1], $Matches[2]
            if ($value.Length -ge 2 -and $value[0] -in @("'", '"') -and $value[-1] -eq $value[0]) { $value = $value.Substring(1, $value.Length - 2) }
            if ($maximums.ContainsKey($name)) {
                if ($value -notmatch '^[0-9]{1,5}$' -or [int]$value -lt 1 -or [int]$value -gt $maximums[$name]) { throw "$name must be an integer from 1 to $($maximums[$name])." }
                $value = ([int]$value).ToString()
            } elseif ($name -in @('CERTICHAT_JEV_VIDEO_ENABLED', 'CERTICHAT_VOICE_ENABLED')) {
                if ($value -cnotin @('true', 'false')) { throw "$name must be true or false." }
            } elseif ($name -eq 'CERTICHAT_VOICE_MODEL') {
                if ($value -cnotin @('openai/gpt-audio-mini', 'openai/gpt-audio')) { throw 'Unreviewed voice model.' }
            } elseif ($name.EndsWith('_MODEL')) {
                if ($value -cne $parameters[$name]) { throw "Unreviewed model: $name" }
            } elseif ($name.EndsWith('_REASONING')) {
                if ($value -cnotin @('medium', 'high')) { throw "$name must be medium or high." }
            } elseif ($name -eq 'CERTICHAT_DATA_DIR') {
                if ($value -cnotmatch '^/data(/[a-z0-9_-]+)?$') { throw 'The index root must be /data or one named child.' }
            } elseif ($value -notmatch '^\d{1,7}(?:\.\d{1,2})?$' -or [decimal]::Parse($value, [Globalization.CultureInfo]::InvariantCulture) -le 0 -or [decimal]::Parse($value, [Globalization.CultureInfo]::InvariantCulture) -gt 1000000) {
                throw "$name must be a positive USD amount up to 1000000 with at most two decimal places."
            }
            if ($name -eq 'CERTICHAT_VOICE_PILOT_BUDGET_USD' -and [decimal]::Parse($value, [Globalization.CultureInfo]::InvariantCulture) -gt 4.58) { throw 'Voice pilot remaining budget must not exceed USD 4.58.' }
            if ($name -eq 'CERTICHAT_CHAT_BUDGET_USD' -and [decimal]::Parse($value, [Globalization.CultureInfo]::InvariantCulture) -gt 50) { throw 'Joint chat and voice budget must not exceed USD 50.' }
            $parameters[$name] = $value
        }
    }
}

function Invoke-Checked([scriptblock]$Action) {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "CertiChat operation failed ($LASTEXITCODE)." }
}

# Package the exact public build as read-only context for SVG narration without rebuilding Cognee.
$corpusRoot = Join-Path $releaseRoot 'dist/assets/certichat'
$publishedRoot = Join-Path $releaseRoot 'services/certichat/app/published'
$publishedManifest = Get-Content -LiteralPath (Join-Path $corpusRoot 'manifest.json') -Raw | ConvertFrom-Json
if ($publishedManifest.schemaVersion -ne 1 -or $publishedManifest.contentHash -cne (Get-FileHash -LiteralPath (Join-Path $corpusRoot 'corpus.json') -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Build corpus failed hash validation. Compile before deploying.' }
New-Item -ItemType Directory -Path $publishedRoot -Force | Out-Null
foreach ($name in @('manifest.json', 'corpus.json')) { Copy-Item -LiteralPath (Join-Path $corpusRoot $name) -Destination (Join-Path $publishedRoot $name) }

# Explicit source roots and exclusions keep production credentials and unrelated work out of the release.
Invoke-Checked { & tar -czf $archive -C $releaseRoot --exclude=.env --exclude='.env.*' --exclude=.private --exclude=__pycache__ --exclude=.pytest_cache services/certichat }
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
             curl --fail --silent --show-error --connect-timeout 5 --max-time 10 http://127.0.0.1:18741/api/health &&
             sudo -n bash "$app/services/certichat/install-timer.sh"; then
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
__PARAMETERS__ CERTICHAT_PUBLISH_PROXY=__PUBLISH_PROXY__ bash "$app/services/certichat/deploy.sh" </dev/null
if [ "$had_previous" = true ]; then
  echo "CertiChat release completed. Previous release preserved at $backup"
else
  echo 'Initial CertiChat release completed.'
fi
'@
$remote = $remote.Replace('__ARCHIVE__', $remoteArchive).Replace('__ID__', $id).Replace('__PUBLISH_PROXY__', $(if ($SkipProxy) { 'false' } else { 'true' })).Replace("`r", '')
$remote = $remote.Replace('__PARAMETERS__', (($parameters.Keys | Sort-Object | ForEach-Object { "$_='$($parameters[$_])'" }) -join ' '))
Invoke-Checked { $remote | & $ssh @options $target 'tr -d "\r" | bash -s' }
Remove-Item -LiteralPath $archive
Write-Output 'CertiChat deployed; public content synchronization uses the systemd timer.'
