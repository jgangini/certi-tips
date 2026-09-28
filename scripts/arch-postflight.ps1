$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & graphify update .
    if ($LASTEXITCODE -ne 0) { throw 'Graphify update failed.' }
    & sentrux check .
    if ($LASTEXITCODE -ne 0 -and (Test-Path '.sentrux/rules.toml')) { throw 'Sentrux check failed.' }
    if (-not (Test-Path '.sentrux/rules.toml')) { Write-Warning 'No architecture rules configured; using the Sentrux regression gate.' }
    & sentrux gate .
    if ($LASTEXITCODE -ne 0) { throw 'Sentrux gate failed.' }
} finally { Pop-Location }
