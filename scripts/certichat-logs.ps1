param(
    [ValidatePattern('^[0-9a-f]{32}$')][string]$TraceId,
    [ValidatePattern('^[1-9][0-9]?[mh]$')][string]$Since = '10m',
    [ValidateRange(1, 1000)][int]$Tail = 200,
    [switch]$Follow,
    [ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$SshHost = '187.77.63.10',
    [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$User = 'jarvisops',
    [string]$KeyPath = "$env:USERPROFILE/.ssh/hostinger_multica_ed25519"
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) { throw 'SSH key not found.' }
$options = @('-i', $KeyPath, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3')
# ponytail: a follow is bounded to 55 seconds; repeat explicitly while diagnosing, not as a daemon.
$prefix = if ($Follow) { 'timeout 55s ' } else { '' }
$live = if ($Follow) { ' --follow' } else { '' }
$remote = "${prefix}docker compose --project-directory /opt/jarvis/apps/certichat --env-file /opt/jarvis/apps/certichat/services/certichat/.env -p certichat -f /opt/jarvis/apps/certichat/services/certichat/compose.yml logs --no-color --no-log-prefix --since $Since --tail $Tail$live api"
& ssh @options "$User@$SshHost" $remote | ForEach-Object {
    try { $record = $_ | ConvertFrom-Json -ErrorAction Stop } catch { return }
    if ($record.schema_version -eq 1 -and $record.service -eq 'certichat-api' -and (-not $TraceId -or $record.trace_id -ceq $TraceId)) { $_ }
}
$code = $LASTEXITCODE
if ($code -ne 0 -and -not ($Follow -and $code -eq 124)) { throw "Read-only log stream failed ($code)." }
