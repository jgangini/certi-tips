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
# Python plugin v0.2.0 captures absolute imports only; see docs/architecture.md.
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
    @('scripts/tool.mjs', 'services/certiquiz/app/bridge.js', '../services/certiquiz/app/bridge.js')
)) {
    Test-ArchitectureCase "Boundary: $($edge[0]) -> $($edge[1])" @{
        $edge[0] = "import { value } from '$($edge[2])'; export const result = value;"
        $edge[1] = 'export const value = 1;'
    } 'boundary'
}
