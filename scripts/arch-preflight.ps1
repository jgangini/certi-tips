$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    if (Test-Path 'graphify-out/GRAPH_REPORT.md') { Get-Content 'graphify-out/GRAPH_REPORT.md' }
    & sentrux gate --save .
    if ($LASTEXITCODE -ne 0) { throw 'Sentrux baseline failed.' }
    & sentrux check .
    if ($LASTEXITCODE -ne 0 -and (Test-Path '.sentrux/rules.toml')) { throw 'Sentrux check failed.' }
    if (-not (Test-Path '.sentrux/rules.toml')) { Write-Warning 'No architecture rules configured; using the Sentrux regression gate.' }
} finally { Pop-Location }
