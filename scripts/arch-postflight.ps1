$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
$savedGitEnvironment = @{}
foreach ($name in @('GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES')) {
    $savedGitEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    # Sentrux enumerates git ls-files: include new sources without changing real staging.
    $objects = (& git rev-parse --path-format=absolute --git-path objects).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot locate Git objects.' }
    $scratch = Join-Path (Get-Location).Path ('output/arch-postflight-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $scratch 'objects') -Force | Out-Null
    $env:GIT_INDEX_FILE = Join-Path $scratch 'index'
    $env:GIT_OBJECT_DIRECTORY = Join-Path $scratch 'objects'
    $env:GIT_ALTERNATE_OBJECT_DIRECTORIES = $objects
    & git read-tree HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize isolated Git index.' }
    & git -c core.autocrlf=false add --all -- .
    if ($LASTEXITCODE -ne 0) { throw 'Cannot include working files in architecture scan.' }
    Write-Host ('Architecture input: {0} Git-visible files, including new files; real index unchanged.' -f @(& git ls-files).Count)
    & graphify update .
    if ($LASTEXITCODE -ne 0) { throw 'Graphify update failed.' }
    & sentrux check .
    if ($LASTEXITCODE -ne 0 -and (Test-Path '.sentrux/rules.toml')) { throw 'Sentrux check failed.' }
    if (-not (Test-Path '.sentrux/rules.toml')) { Write-Warning 'No architecture rules configured; using the Sentrux regression gate.' }
    & sentrux gate .
    if ($LASTEXITCODE -ne 0) { throw 'Sentrux gate failed.' }
} finally {
    foreach ($name in $savedGitEnvironment.Keys) {
        if ([string]::IsNullOrEmpty($savedGitEnvironment[$name])) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item -LiteralPath "Env:$name" -Value $savedGitEnvironment[$name]
        }
    }
    Pop-Location
}
