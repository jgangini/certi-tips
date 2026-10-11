param([switch]$Test, [switch]$Build)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$service = Join-Path $repo 'services/certichat'
$envFile = Join-Path $service '.env'

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "CertiChat Docker command failed ($LASTEXITCODE)." }
}

if ($Test) {
    # Isolated tmpfs database and dummy values: local tests cannot consume the real OpenRouter key.
    $envFile = Join-Path $repo 'output/certichat-test-compose.env'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $envFile)) | Out-Null
    $values = @(
        'OPENROUTER_API_KEY=disposable-test-openrouter-key-00001'
        'CERTICHAT_TURNSTILE_SECRET=disposable-test-turnstile-key-00001'
        'CERTICHAT_NETWORK_SECRET=disposable-test-network-secret-00001'
        'CERTICHAT_CHAT_INTERNAL_TOKEN=disposable-test-chat-token-000000001'
        'CERTICHAT_INDEX_INTERNAL_TOKEN=disposable-test-index-token-00000001'
        'CERTICHAT_POSTGRES_ADMIN_PASSWORD=certichat-disposable-test-admin-password'
        'CERTICHAT_POSTGRES_RUNTIME_PASSWORD=certichat-disposable-test-runtime-password'
        'CERTICHAT_DATABASE_URL=postgresql://unused:unused@unused/unused'
    )
    [IO.File]::WriteAllLines($envFile, $values, [Text.UTF8Encoding]::new($false))
} elseif (-not (Test-Path -LiteralPath $envFile)) {
    throw 'Configure services/certichat/.env with private server settings, or use -Test for isolated checks.'
}
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
    Invoke-Docker @compose up -d --wait api knowledge
    Write-Output 'CertiChat health: http://127.0.0.1:18741/api/health'
}
