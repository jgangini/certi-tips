"""Exercise the real activation shell flow with fault-injected Docker commands."""
import os
from pathlib import Path
import subprocess
import sys
import shlex

import pytest


def test_indexer_compose_command_keeps_python_entrypoint():
    compose = Path(__file__).resolve().parents[1] / "compose.yml"
    text = compose.read_text().split("  indexer:\n", 1)[1].split("\n  volume-init:", 1)[0]
    assert "entrypoint: [python, -m, app.indexer]" in text
    assert "command: [build]" in text


@pytest.mark.skipif(sys.platform == "win32", reason="Run Linux shell checks through scripts/certichat-local.ps1 -Test")
@pytest.mark.parametrize("fault", ["none", "sigterm", "sigterm_failed", "zero_failed", "oom", "killed", "unexpected", "activate", "candidate"])
def test_activation_recovery(tmp_path, fault):
    source = Path(__file__).resolve().parents[1] / "sync-knowledge.sh"
    text = source.read_text().replace("cd /opt/jarvis/apps/certichat", f"cd '{tmp_path}'")
    text = text.replace("/opt/jarvis/backups/certichat/deploy.lock", str(tmp_path / "deploy.lock"))
    script = tmp_path / "sync.sh"
    script.write_text(text)
    docker = tmp_path / "docker"
    docker.write_text(f"#!{sys.executable}\n" + '''
import os, sys
from pathlib import Path
args = sys.argv[1:]
log = Path(os.environ['DOCKER_LOG'])
previous = log.read_text() if log.exists() else ''
operation = next((arg for arg in args if arg in ('build','changed','activate','rollback','stop','up','ps','inspect','logs')), 'unknown')
with log.open('a') as stream:
    stream.write(operation + '\\n')
fault = os.environ['FAULT']
if operation == 'changed': print('yes')
if operation == 'ps': print('worker')
if operation == 'inspect':
    code = 137 if fault == 'killed' else 143 if fault.startswith('sigterm') else 1 if fault == 'unexpected' else 0
    print(f"{code} {'true' if fault == 'oom' else 'false'} 2026-10-11T00:00:00Z")
if operation == 'logs':
    assert args == ['logs', '--since', '2026-10-11T00:00:00Z', 'worker']
    print('Application shutdown failed.' if fault.endswith('failed') else 'Application shutdown complete.')
if operation == 'activate' and fault == 'activate': sys.exit(1)
if operation == 'up' and fault == 'candidate' and 'up\\n' not in previous: sys.exit(1)
''')
    docker.chmod(0o700)
    # Compose deliberately mounts /tmp noexec; invoke the stub through Python.
    script.write_text(f'docker() {{ {shlex.quote(sys.executable)} {shlex.quote(str(docker))} "$@"; }}\n' + text)
    log = tmp_path / "commands"
    env = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}", "DOCKER_LOG": str(log), "FAULT": fault}
    result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, timeout=15)
    assert log.exists(), result.stderr
    calls = log.read_text().splitlines()
    assert result.returncode == (0 if fault in ("none", "sigterm") else 1), result.stderr
    assert "up" in calls
    if fault in ("killed", "sigterm_failed", "zero_failed", "oom", "unexpected"):
        assert "activate" not in calls
    elif fault == "candidate":
        assert "rollback" in calls and calls.count("up") == 2
    elif fault == "activate":
        assert "rollback" not in calls and calls.count("up") == 1
