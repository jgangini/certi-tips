param([switch]$Test, [switch]$Build, [string]$SnapshotArchive)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$service = Join-Path $repo 'services/certichat'
$envFile = Join-Path $service '.env'

function Invoke-Docker {
    $previous = @{}
    try {
        foreach ($name in $values.Keys) {
            $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
        }
        & docker @args
        if ($LASTEXITCODE -ne 0) { throw "CertiChat Docker command failed ($LASTEXITCODE)." }
    } finally {
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    }
}

function Read-PrivateValues($Path, $Names) {
    $result = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $Matches[1] -in $Names) {
                $name, $value = $Matches[1], $Matches[2]
                if ($value.Length -ge 2 -and $value[0] -in @("'", '"') -and $value[-1] -eq $value[0]) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                $result[$name] = $value
            }
        }
    }
    return $result
}

$values = @{
    CERTICHAT_MODE = 'VPS'
    CERTICHAT_PUBLIC_ORIGIN = 'https://certichat.cloudtechnext.net'
    CERTICHAT_ALLOWED_ORIGINS = 'https://jgangini.github.io'
    CERTICHAT_TURNSTILE_HOSTNAME = 'jgangini.github.io'
    CERTICHAT_PORT = '18741'
    CERTICHAT_SECURE_COOKIES = 'true'
    CERTICHAT_TRUSTED_PROXY_IPS = '127.0.0.1'
    CERTICHAT_REFRESH = '6'
    CERTICHAT_QUESTIONS = '20'
    CERTICHAT_INDEX_REFRESH_MINUTES = '5'
    CERTICHAT_INDEX_BUDGET_USD = '10'
    CERTICHAT_CHAT_BUDGET_USD = '10'
}
if ($Test) {
    # Isolated tmpfs database and dummy values: local tests cannot consume the real OpenRouter key.
    $envFile = Join-Path $repo 'output/certichat-test-compose.env'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $envFile)) | Out-Null
    $values += @{
        OPENROUTER_API_KEY = 'disposable-test-openrouter-key-00001'
        CERTICHAT_TURNSTILE_SECRET = 'disposable-test-turnstile-key-00001'
        CERTICHAT_NETWORK_SECRET = 'disposable-test-network-secret-00001'
        CERTICHAT_CHAT_INTERNAL_TOKEN = 'disposable-test-chat-token-000000001'
        CERTICHAT_INDEX_INTERNAL_TOKEN = 'disposable-test-index-token-00000001'
        CERTICHAT_POSTGRES_ADMIN_PASSWORD = 'certichat-disposable-test-admin-password'
        CERTICHAT_POSTGRES_RUNTIME_PASSWORD = 'certichat-disposable-test-runtime-password'
        CERTICHAT_DATABASE_URL = 'postgresql://unused:unused@unused/unused'
    }
} else {
    $private = Read-PrivateValues (Join-Path $repo '.private/certichat.env') @('CERTICHAT_MODE', 'OPENROUTER_API_KEY', 'CERTICHAT_REFRESH', 'CERTICHAT_QUESTIONS', 'CERTICHAT_INDEX_REFRESH_MINUTES', 'CERTICHAT_INDEX_BUDGET_USD', 'CERTICHAT_CHAT_BUDGET_USD')
    if ($private.CERTICHAT_MODE -cne 'LOCAL') { throw 'Set CERTICHAT_MODE=LOCAL in .private/certichat.env before starting the local API.' }
    if (-not $private.OPENROUTER_API_KEY -or $private.OPENROUTER_API_KEY -match "['\r\n]") {
        throw 'A valid OPENROUTER_API_KEY is required in .private/certichat.env.'
    }
    $maximums = @{ CERTICHAT_REFRESH = 24; CERTICHAT_QUESTIONS = 100; CERTICHAT_INDEX_REFRESH_MINUTES = 15 }
    foreach ($name in $maximums.Keys) {
        if ($private.ContainsKey($name)) {
            if ($private[$name] -notmatch '^[0-9]{1,3}$' -or [int]$private[$name] -lt 1 -or [int]$private[$name] -gt $maximums[$name]) {
                throw "$name must be an integer from 1 to $($maximums[$name])."
            }
            $values[$name] = ([int]$private[$name]).ToString()
        }
    }
    foreach ($name in @('CERTICHAT_INDEX_BUDGET_USD', 'CERTICHAT_CHAT_BUDGET_USD')) {
        if ($private.ContainsKey($name)) {
            if ($private[$name] -notmatch '^\d{1,7}(?:\.\d{1,2})?$' -or [decimal]::Parse($private[$name], [Globalization.CultureInfo]::InvariantCulture) -le 0 -or [decimal]::Parse($private[$name], [Globalization.CultureInfo]::InvariantCulture) -gt 1000000) { throw "$name must be a positive USD amount up to 1000000 with at most two decimal places." }
            $values[$name] = $private[$name]
        }
    }
    $secretNames = @('CERTICHAT_POSTGRES_ADMIN_PASSWORD', 'CERTICHAT_POSTGRES_RUNTIME_PASSWORD',
        'CERTICHAT_CHAT_INTERNAL_TOKEN', 'CERTICHAT_INDEX_INTERNAL_TOKEN', 'CERTICHAT_NETWORK_SECRET', 'CERTICHAT_TURNSTILE_SECRET')
    $existing = Read-PrivateValues $envFile (@('CERTICHAT_MODE') + $secretNames)
    if ((Test-Path -LiteralPath $envFile) -and $existing.CERTICHAT_MODE -cne 'LOCAL') {
        throw 'Refusing to overwrite a non-LOCAL services/certichat/.env. Keep VPS credentials on the server.'
    }
    foreach ($name in $secretNames) {
        if ($existing[$name] -and $existing[$name] -notmatch '^[a-fA-F0-9]{64}$') { throw "Invalid local credential format: $name" }
        $values[$name] = if ($existing[$name]) { $existing[$name] } else { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
    }
    $values.CERTICHAT_MODE = 'LOCAL'
    $values.CERTICHAT_PUBLIC_ORIGIN = 'http://127.0.0.1:18741'
    $values.CERTICHAT_ALLOWED_ORIGINS = 'http://127.0.0.1:4173'
    $values.CERTICHAT_TURNSTILE_HOSTNAME = '127.0.0.1'
    $values.CERTICHAT_SECURE_COOKIES = 'false'
    $values.OPENROUTER_API_KEY = $private.OPENROUTER_API_KEY
    $values.CERTICHAT_DATABASE_URL = "postgresql://certichat_runtime:$($values.CERTICHAT_POSTGRES_RUNTIME_PASSWORD)@postgres:5432/certichat"
}
[IO.File]::WriteAllLines($envFile, @($values.Keys | Sort-Object | ForEach-Object { "$_='$($values[$_])'" }), [Text.UTF8Encoding]::new($false))
$compose = @('compose', '--project-directory', $repo, '--env-file', $envFile, '-p', 'certichat-local', '-f', (Join-Path $service 'compose.yml'))
if ($Test) {
    Invoke-Docker @compose build api test
    try { Invoke-Docker @compose --profile test run --rm test }
    finally { Invoke-Docker @compose --profile test stop test-postgres }
} else {
    if ($Build) { Invoke-Docker @compose build api knowledge }
    Invoke-Docker @compose up -d --wait postgres
    Invoke-Docker @compose run --rm migrate
    Invoke-Docker @compose run --rm volume-init
    if ($SnapshotArchive) {
        $snapshotPath = (Resolve-Path -LiteralPath $SnapshotArchive).Path
        if (-not (Test-Path -LiteralPath $snapshotPath -PathType Leaf)) { throw 'SnapshotArchive must be a private tar archive.' }
        # A snapshot must be exported after its writer stops; never copy an open Cognee database.
        $importSnapshot = @'
import tarfile
from pathlib import Path, PurePosixPath
root = Path('/data')
if (root / 'active.json').exists():
    raise SystemExit('A local snapshot is already active; refusing to overwrite it.')
with tarfile.open('/snapshot.tar') as archive:
    members = archive.getmembers()
    for member in members:
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Invalid snapshot archive member')
        if not path.parts or path.parts[0] not in ('active.json', 'latest.json', 'snapshots'):
            raise SystemExit('Unexpected snapshot archive path')
    if not any(member.name == 'active.json' and member.isfile() for member in members):
        raise SystemExit('Snapshot archive has no active index')
    archive.extractall(root, members=sorted(members, key=lambda item: item.name == 'active.json'), filter='data')
'@
        $importFailed = $false
        try {
            Invoke-Docker @compose stop knowledge
            Invoke-Docker @compose run --rm --no-deps -v "${snapshotPath}:/snapshot.tar:ro" knowledge python -c $importSnapshot
        } catch {
            $importFailed = $true
            throw
        } finally {
            try { Invoke-Docker @compose up -d --wait knowledge }
            catch {
                if (-not $importFailed) { throw }
                Write-Warning -WarningAction Continue 'Could not restart the local knowledge service; the original import error is preserved.'
            }
        }
    }
    Invoke-Docker @compose up -d --wait api knowledge
    Invoke-Docker @compose --profile ops run --rm indexer refresh
    Invoke-Docker @compose --profile local up -d local-refresh
    Write-Output 'CertiChat health: http://127.0.0.1:18741/api/health'
    Write-Output 'LOCAL mode: only http://127.0.0.1:4173 is allowed; Turnstile is skipped. An active local knowledge snapshot is required for answers.'
}
