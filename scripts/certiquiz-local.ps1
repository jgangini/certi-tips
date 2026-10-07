param([switch]$Test, [switch]$Build)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$service = Join-Path $repo 'services/certiquiz'
$envFile = Join-Path $service '.env'

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker failed ($LASTEXITCODE)." }
}

if (-not (Test-Path -LiteralPath $envFile)) {
    function New-Secret { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
    $adminPassword = New-Secret
    $runtimePassword = New-Secret
    $lines = @(
        "CERTIQUIZ_POSTGRES_ADMIN_PASSWORD='$adminPassword'"
        "CERTIQUIZ_POSTGRES_RUNTIME_PASSWORD='$runtimePassword'"
        "CERTIQUIZ_DATABASE_URL='postgresql://certiquiz_runtime:${runtimePassword}@postgres:5432/certiquiz'"
        "CERTIQUIZ_PUBLIC_ORIGIN='http://127.0.0.1:18740'"
        "CERTIQUIZ_ALLOWED_ORIGINS='http://127.0.0.1:4173'"
        "CERTIQUIZ_SECURE_COOKIES=false"
        "CERTIQUIZ_PORT=18740"
        "CERTIQUIZ_TRUSTED_PROXY_IPS=127.0.0.1"
        "CERTIQUIZ_CATALOG_SOURCE=bundled"
    )
    [IO.File]::WriteAllLines($envFile, $lines, [Text.UTF8Encoding]::new($false))
    $acl = Get-Acl -LiteralPath $envFile
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User, 'FullControl', 'Allow'))
    Set-Acl -LiteralPath $envFile -AclObject $acl
}
if (-not ([IO.File]::ReadLines($envFile) | Where-Object { $_ -match '^CERTIQUIZ_ALLOWED_ORIGINS=' })) {
    [IO.File]::AppendAllText($envFile, "`nCERTIQUIZ_ALLOWED_ORIGINS='http://127.0.0.1:4173'`n", [Text.UTF8Encoding]::new($false))
}
if (-not ([IO.File]::ReadLines($envFile) | Where-Object { $_ -match '^CERTIQUIZ_CATALOG_SOURCE=' })) {
    [IO.File]::AppendAllText($envFile, "`nCERTIQUIZ_CATALOG_SOURCE=bundled`n", [Text.UTF8Encoding]::new($false))
}
$compose = @('compose', '--project-directory', $repo, '--env-file', $envFile, '-p', 'certiquiz-local', '-f', (Join-Path $service 'compose.yml'))
$apiImage = (& docker @compose config --images api) | Where-Object { $_ -like 'certiquiz-api:*' }
if ($LASTEXITCODE -ne 0 -or @($apiImage).Count -ne 1) { throw 'Could not resolve the CertiQuiz API image.' }
& docker image inspect $apiImage --format '{{.Id}}' 2>$null | Out-Null
$imageMissing = $LASTEXITCODE -ne 0
if ($Build -or $Test -or $imageMissing) { Invoke-Docker @compose build api }
Invoke-Docker @compose up -d --wait postgres
Invoke-Docker @compose run --rm migrate
Invoke-Docker @compose up -d --wait api
if ($Test) { Invoke-Docker @compose --profile test run --build --rm test }
Write-Output 'CertiQuiz frontend (CertiTips preview): http://127.0.0.1:4173/certi-tips/certiquiz/'
Write-Output 'CertiQuiz API health: http://127.0.0.1:18740/api/health'
