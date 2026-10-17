$ErrorActionPreference = 'Stop'
$trace = '1234567890abcdef1234567890abcdef'
function ssh {
    $global:certichatLogTestArguments = $args
    $global:LASTEXITCODE = if (($args -join ' ') -match 'timeout 55s') { 124 } else { 0 }
    'legacy output'
    '{"schema_version":1,"service":"certichat-api","trace_id":"1234567890abcdef1234567890abcdef","event":"http.request"}'
    '{"schema_version":1,"service":"other","event":"ignored"}'
    '{"schema_version":1,"service":"certichat-api","trace_id":"ffffffffffffffffffffffffffffffff","event":"browser.state"}'
}
$scriptPath = Join-Path $PSScriptRoot 'certichat-logs.ps1'
$records = @(& $scriptPath -KeyPath $PSCommandPath -TraceId $trace -Follow -Since 2m -Tail 17)
if ($records.Count -ne 1 -or ($records[0] | ConvertFrom-Json).trace_id -cne $trace) { throw 'JSON/trace filter failed.' }
$command = $global:certichatLogTestArguments[-1]
if ($command -notmatch '^timeout 55s docker compose .* logs --no-color --no-log-prefix --since 2m --tail 17 --follow api$' -or ($global:certichatLogTestArguments -join ' ') -notmatch 'StrictHostKeyChecking=yes') { throw 'SSH command or follow bound changed.' }
$records = @(& $scriptPath -KeyPath $PSCommandPath)
if ($records.Count -ne 2 -or $global:certichatLogTestArguments[-1] -match 'timeout|--follow') { throw 'Snapshot filtering failed.' }
foreach ($invalid in @(@{Since='1m;whoami'}, @{TraceId='bad'}, @{Tail=1001})) {
    $rejected = $false
    try { & $scriptPath -KeyPath $PSCommandPath @invalid | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Unsafe argument accepted.' }
}
Write-Host 'Log reader: JSON filtering, trace, bounded follow, SSH policy and invalid input pass; no network calls.'
