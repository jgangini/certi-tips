$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $repo "output/certichat-local-selfcheck-$([guid]::NewGuid().ToString('N'))"
foreach ($directory in @('scripts', '.private', 'services/certichat')) {
    [IO.Directory]::CreateDirectory((Join-Path $fixture $directory)) | Out-Null
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'certichat-local.ps1') -Destination (Join-Path $fixture 'scripts/certichat-local.ps1')
[IO.File]::WriteAllText((Join-Path $fixture '.private/certichat.env'), "CERTICHAT_MODE=LOCAL`nOPENROUTER_API_KEY=disposable-config-test-key`n")
$archive = Join-Path $fixture 'fixture.tar'
[IO.File]::WriteAllText($archive, 'The Docker stub prevents this fixture from being imported.')

# Exercise the real orchestration without Docker, secrets, network calls or snapshot writes.
foreach ($fault in @('import', 'import-and-restart', 'restart', 'none')) {
    $calls = [Collections.Generic.List[string]]::new()
    function docker {
        if ($args -contains 'python') {
            $calls.Add('import')
            $global:LASTEXITCODE = if ($fault.StartsWith('import')) { 23 } else { 0 }
        } elseif ($args -contains 'stop') {
            $calls.Add('stop')
            $global:LASTEXITCODE = 0
        } elseif ($args -contains 'up' -and $args[-1] -eq 'knowledge' -and $args -notcontains 'api') {
            $calls.Add('restart')
            $global:LASTEXITCODE = if ($fault.EndsWith('restart')) { 24 } else { 0 }
        } else {
            $global:LASTEXITCODE = 0
        }
    }
    $failure = $null
    try { & (Join-Path $fixture 'scripts/certichat-local.ps1') -SnapshotArchive $archive | Out-Null }
    catch { $failure = $_.Exception.Message }
    finally { Remove-Item Function:docker }
    if (($calls -join ',') -ne 'stop,import,restart') { throw "Snapshot recovery sequence failed: $fault" }
    $expectedCode = if ($fault.StartsWith('import')) { 23 } elseif ($fault -eq 'restart') { 24 } else { 0 }
    if (($expectedCode -eq 0 -and $failure) -or ($expectedCode -ne 0 -and $failure -ne "CertiChat Docker command failed ($expectedCode).")) {
        throw "Snapshot failure was lost or replaced: $fault"
    }
}
Write-Output 'CertiChat local self-check passed: snapshot failures restart knowledge and preserve the original error.'

$override = Join-Path $fixture '.private/certivoice-ca.compose.yml'
[IO.File]::WriteAllText($override, '{"services":{"api":{"volumes":[]}}}')
$contextOverride = Join-Path $fixture '.private/certivoice-context.compose.yml'
[IO.File]::WriteAllText($contextOverride, '{"services":{"api":{"volumes":[]}}}')
foreach ($mode in @('normal', 'test', 'pilot')) {
    $seen = [Collections.Generic.List[bool]]::new()
    function docker {
        $seen.Add($args -contains $override)
        $seen.Add($args -contains $contextOverride)
        $global:LASTEXITCODE = 0
    }
    try {
        $options = if ($mode -eq 'pilot') { @{VoicePilot=$true} } elseif ($mode -eq 'test') { @{Test=$true} } else { @{} }
        & (Join-Path $fixture 'scripts/certichat-local.ps1') @options | Out-Null
    } finally { Remove-Item Function:docker }
    if ($seen.Count -eq 0 -or @($seen | Where-Object { $_ -ne ($mode -eq 'pilot') }).Count) {
        throw "Private pilot override escaped its pilot scope: $mode"
    }
}
Write-Output 'CertiChat override self-check passed: only the isolated voice pilot includes CA and corpus overrides.'
