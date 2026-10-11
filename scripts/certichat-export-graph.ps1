# Export only the public graph projection from the running local knowledge owner.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
    $export = @'
import json, os, urllib.request
request = urllib.request.Request(
    'http://knowledge:8001/graph',
    headers={'Authorization': 'Bearer ' + os.environ['CERTICHAT_CHAT_INTERNAL_TOKEN']})
with urllib.request.urlopen(request, timeout=60) as response:
    graph = json.load(response)
assert set(graph) == {'version', 'generatedAt', 'nodes', 'edges'}
assert graph['nodes'] and graph['edges']
assert all(set(node) == {'id', 'label', 'type'} for node in graph['nodes'])
assert all(set(edge) == {'source', 'target', 'label'} for edge in graph['edges'])
print(json.dumps(graph, ensure_ascii=True, separators=(',', ':')))
'@
    $json = & docker compose --project-directory . --env-file services/certichat/.env -f services/certichat/compose.yml -p certichat-local exec -T api python -c $export
    if ($LASTEXITCODE -ne 0) { throw 'Graph export failed; the previous public snapshot was preserved.' }
    $graph = $json | ConvertFrom-Json
    $destination = Join-Path $repo 'data/certichat-graph.json'
    [IO.File]::WriteAllText("$destination.tmp", ($json -join "`n"), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath "$destination.tmp" -Destination $destination -Force
    Write-Output ("Public graph exported: {0} concepts, {1} relationships, version {2}. Run npm run build to refresh the page." -f $graph.nodes.Count, $graph.edges.Count, $graph.version)
} finally { Pop-Location }
