# Run with: pwsh -File scripts/check-architecture-rules.ps1
# Exercise the installed Sentrux binary without changing source files or the Git index.
$ErrorActionPreference = 'Stop'
$rulesPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.sentrux/rules.toml'
$rules = [IO.File]::ReadAllText($rulesPath)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
Get-Command sentrux -ErrorAction Stop | Out-Null

function Test-ArchitectureCase([string]$Name, [hashtable]$Files, [string]$Violation = '') {
    $caseRoot = Join-Path $tempRoot ('certitips-sentrux-' + [guid]::NewGuid())
    try {
        New-Item -ItemType Directory -Path "$caseRoot/.sentrux" | Out-Null
        [IO.File]::WriteAllText("$caseRoot/.sentrux/rules.toml", $rules)
        foreach ($file in $Files.GetEnumerator()) {
            $target = Join-Path $caseRoot $file.Key
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            [IO.File]::WriteAllText($target, $file.Value)
        }
        $output = (& sentrux check $caseRoot 2>&1 | Out-String)
        $expectedExit = if ($Violation) { 1 } else { 0 }
        if ($LASTEXITCODE -ne $expectedExit -or $output -notmatch '\| [1-9]\d* import,' -or ($Violation -and $output -notmatch ('\[Error\] ' + [regex]::Escape($Violation) + ':'))) {
            throw "${Name}: unexpected Sentrux result (exit $LASTEXITCODE).`n$output"
        }
        Write-Output "PASS: $Name"
    } finally {
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($caseRoot)) -ne $tempRoot) { throw 'Unexpected temporary test path.' }
        Remove-Item -LiteralPath $caseRoot -Recurse -Force
    }
}

Test-ArchitectureCase 'Browser, renderer and tests can consume their dependencies' @{
    'assets/quiz-core.js' = 'export const value = 1;'
    'assets/storage.js' = 'export const stored = 1;'
    'assets/quiz.js' = "import { value } from './quiz-core.js'; import { stored } from './storage.js'; export const result = value + stored;"
    'scripts/layout.mjs' = 'export const html = "ok";'
    'scripts/build.mjs' = "import { html } from './layout.mjs'; export const result = html;"
    'tests/quiz.test.mjs' = "import { value } from '../assets/quiz-core.js'; export const result = value;"
}
Test-ArchitectureCase 'Quiz domain cannot depend on browser storage' @{
    'assets/quiz-core.js' = "import { stored } from './storage.js'; export const result = stored;"
    'assets/storage.js' = 'export const stored = 1;'
} 'layer_direction'
# Python plugin v0.2.0 captures absolute imports only; relative-import edges are not covered by this installed parser.
Test-ArchitectureCase 'Resolved Python imports can consume domain and security' @{
    'services/certiquiz/app/__init__.py' = ''
    'services/certiquiz/app/game.py' = "def new_room():`n    return 1`n"
    'services/certiquiz/app/security.py' = "def new_token():`n    return 1`n"
    'services/certiquiz/app/store.py' = "from app.game import new_room`nclass Store:`n    def create(self):`n        return new_room()`n"
    'services/certiquiz/app/main.py' = "from app.store import Store`nfrom app.security import new_token`ndef create_app():`n    return Store(), new_token()`n"
}
Test-ArchitectureCase 'Game rules cannot depend on persistence' @{
    'services/certiquiz/app/__init__.py' = ''
    'services/certiquiz/app/game.py' = "from app.store import Store`ndef new_room():`n    return Store()`n"
    'services/certiquiz/app/store.py' = "class Store:`n    def create(self):`n        return 1`n"
} 'layer_direction'
Test-ArchitectureCase 'Application code cannot import tests' @{
    'assets/quiz.js' = "import { value } from '../tests/helper.mjs'; export const result = value;"
    'tests/helper.mjs' = 'export const value = 1;'
} 'layer_direction'
Test-ArchitectureCase 'Dependency cycles are rejected' @{
    'assets/site.js' = "import { quiz } from './quiz.js'; export function site() { return quiz; }"
    'assets/quiz.js' = "import { site } from './site.js'; export function quiz() { return site; }"
} 'max_cycles'

# Same-order modules isolate boundary checks from layer-direction checks.
foreach ($edge in @(
    @('assets/nested/ui.js', 'scripts/tool.mjs', '../../scripts/tool.mjs'),
    @('assets/ui.js', 'services/certiquiz/app/bridge.js', '../services/certiquiz/app/bridge.js'),
    @('services/certiquiz/app/bridge.js', 'assets/ui.js', '../../../assets/ui.js'),
    @('services/certiquiz/app/bridge.js', 'scripts/tool.mjs', '../../../scripts/tool.mjs'),
    @('scripts/tool.mjs', 'services/certiquiz/app/bridge.js', '../services/certiquiz/app/bridge.js'),
    @('assets/ui.js', 'services/certichat/app/bridge.js', '../services/certichat/app/bridge.js'),
    @('services/certichat/app/bridge.js', 'assets/ui.js', '../../../assets/ui.js'),
    @('services/certichat/app/bridge.js', 'scripts/tool.mjs', '../../../scripts/tool.mjs'),
    @('scripts/tool.mjs', 'services/certichat/app/bridge.js', '../services/certichat/app/bridge.js')
)) {
    Test-ArchitectureCase "Boundary: $($edge[0]) -> $($edge[1])" @{
        $edge[0] = "import { value } from '$($edge[2])'; export const result = value;"
        $edge[1] = 'export const value = 1;'
    } 'boundary'
}

function Test-ArchitectureCleanup([string]$Wrapper, [bool]$Failure, [bool]$PresetEnvironment) {
    $caseRoot = Join-Path $tempRoot ('certitips-wrapper-' + [guid]::NewGuid())
    $location = (Get-Location).Path
    $exitCode = $global:LASTEXITCODE
    $PSNativeCommandUseErrorActionPreference = $true
    $environmentPaths = @('Env:GIT_INDEX_FILE', 'Env:GIT_OBJECT_DIRECTORY', 'Env:GIT_ALTERNATE_OBJECT_DIRECTORIES')
    $savedEnvironment = @(Get-Item -LiteralPath $environmentPaths -ErrorAction SilentlyContinue)
    Remove-Item -LiteralPath $environmentPaths -ErrorAction SilentlyContinue
    try {
        New-Item -ItemType Directory -Path "$caseRoot/scripts", "$caseRoot/.sentrux" | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $Wrapper) -Destination "$caseRoot/scripts/$Wrapper"
        [IO.File]::WriteAllText("$caseRoot/.sentrux/rules.toml", $rules)
        [IO.File]::WriteAllText("$caseRoot/.gitignore", "output/`n")
        [IO.File]::WriteAllText("$caseRoot/source.js", 'export const value = 1;')
        & git -C $caseRoot init -q
        & git -C $caseRoot -c core.autocrlf=false add .
        & git -C $caseRoot -c user.name=Fixture -c user.email=fixture@example.test commit -q --no-gpg-sign -m fixture
        [IO.File]::WriteAllText("$caseRoot/source.js", 'export const value = 2;')
        & git -C $caseRoot add source.js
        [IO.File]::WriteAllText("$caseRoot/source.js", 'export const value = 3;')
        [IO.File]::WriteAllText("$caseRoot/new.js", 'export const added = true;')
        $indexHash = (Get-FileHash -LiteralPath "$caseRoot/.git/index").Hash
        if ($PresetEnvironment) {
            $env:GIT_INDEX_FILE = "$caseRoot/.git/index"
            $env:GIT_OBJECT_DIRECTORY = "$caseRoot/.git/objects"
            $env:GIT_ALTERNATE_OBJECT_DIRECTORIES = "$caseRoot/.git/objects"
        }
        $expectedEnvironment = [string](Get-Item -LiteralPath $environmentPaths -ErrorAction SilentlyContinue | Select-Object Name, Value | ConvertTo-Json -Compress)
        $scratchDirectories = [Collections.Generic.List[string]]::new()
        # Stub only architecture tools; Git must exercise the wrapper's real isolated index.
        function graphify { $global:LASTEXITCODE = 0 }
        function sentrux {
            $scratchDirectories.Add((Split-Path -Parent $env:GIT_INDEX_FILE))
            if (-not (Test-Path -LiteralPath $env:GIT_OBJECT_DIRECTORY)) { throw 'Isolated objects directory is missing.' }
            $files = @(& git ls-files)
            $content = & git show ':source.js'
            if ($files -notcontains 'new.js' -or $content -ne 'export const value = 3;') {
                throw 'Architecture scan did not include the complete working tree.'
            }
            $global:LASTEXITCODE = if ($Failure -and $args[0] -eq 'check') { 17 } else { 0 }
        }
        $failureMessage = $null
        try { & "$caseRoot/scripts/$Wrapper" | Out-Null }
        catch { $failureMessage = $_.Exception.Message }
        $expectedFailure = if ($Failure) { 'Sentrux check failed.' } else { $null }
        if ($failureMessage -ne $expectedFailure) {
            throw "${Wrapper}: unexpected result: $failureMessage"
        }
        if (-not $scratchDirectories.Count -or ($scratchDirectories | Where-Object { Test-Path -LiteralPath $_ })) {
            throw "${Wrapper}: architecture scratch was not created and removed."
        }
        if ((Get-Location).Path -ne $location -or (Get-FileHash -LiteralPath "$caseRoot/.git/index").Hash -ne $indexHash) {
            throw "${Wrapper}: caller location or real Git index changed."
        }
        $actualEnvironment = [string](Get-Item -LiteralPath $environmentPaths -ErrorAction SilentlyContinue | Select-Object Name, Value | ConvertTo-Json -Compress)
        if ($actualEnvironment -cne $expectedEnvironment) {
            throw "${Wrapper}: Git environment was not restored."
        }
        Write-Output "PASS: $Wrapper cleanup (failure=$Failure, preset Git environment=$PresetEnvironment)"
    } finally {
        Remove-Item -LiteralPath $environmentPaths -ErrorAction SilentlyContinue
        foreach ($item in $savedEnvironment) { Set-Item -LiteralPath "Env:$($item.Name)" -Value $item.Value }
        Set-Location -LiteralPath $location
        $global:LASTEXITCODE = $exitCode
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($caseRoot)) -ne $tempRoot) { throw 'Unexpected temporary wrapper path.' }
        if (Test-Path -LiteralPath $caseRoot) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
    }
}

foreach ($wrapper in @('arch-preflight.ps1', 'arch-postflight.ps1')) {
    foreach ($failure in @($false, $true)) {
        Test-ArchitectureCleanup $wrapper $failure $failure
    }
}
