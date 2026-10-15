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
def test_deployment_forces_vps_and_preserves_private_credentials(tmp_path):
    source = Path(__file__).resolve().parents[1] / "deploy.sh"
    # Execute the real configuration phase, stopping before the first Docker operation.
    setup = source.read_text().split("\ncompose=", 1)[0]
    setup = setup.replace("cd /opt/jarvis/apps/certichat", f"cd {shlex.quote(str(tmp_path))}")
    names = ("CERTICHAT_MODE", "CERTICHAT_PUBLIC_ORIGIN", "CERTICHAT_ALLOWED_ORIGINS",
             "CERTICHAT_TURNSTILE_HOSTNAME", "CERTICHAT_SECURE_COOKIES", "CERTICHAT_PORT",
             "CERTICHAT_REFRESH", "CERTICHAT_QUESTIONS", "CERTICHAT_INDEX_REFRESH_MINUTES",
             "CERTICHAT_INDEX_BUDGET_USD", "CERTICHAT_CHAT_BUDGET_USD",
             "CERTICHAT_INDEX_MODEL", "CERTICHAT_CHAT_MODEL", "CERTICHAT_INDEX_REASONING",
             "CERTICHAT_CHAT_REASONING", "CERTICHAT_INDEX_MAX_TOKENS", "CERTICHAT_CHAT_MAX_TOKENS", "CERTICHAT_DATA_DIR")
    expected = ("VPS", "https://certichat.cloudtechnext.net", "https://jgangini.github.io",
                "jgangini.github.io", "true", "18741", "12", "42", "7", "12.50", "9.25",
                "anthropic/claude-haiku-5.5", "openai/gpt-5.4", "high", "medium", "16384", "8192", "/data/claude55-haiku")
    script = tmp_path / "deploy-config.sh"
    script.write_text(setup + "\nprintf '%s\\n' " + " ".join(f'"${{{name}}}"' for name in names) + "\n")
    private = tmp_path / "services/certichat/.env"
    private.parent.mkdir(parents=True)
    private.write_text("OPENROUTER_API_KEY='test-provider-key'\nCERTICHAT_TURNSTILE_SECRET='test-turnstile-key'\n"
                       "CERTICHAT_MODE='LOCAL'\nCERTICHAT_ALLOWED_ORIGINS='http://127.0.0.1:4173'\n"
                       "CERTICHAT_REFRESH='3'\nCERTICHAT_QUESTIONS='5'\nCERTICHAT_INDEX_REFRESH_MINUTES='4'\n"
                       "CERTICHAT_POSTGRES_ADMIN_PASSWORD='preserved-admin'\n"
                       "CERTICHAT_POSTGRES_RUNTIME_PASSWORD='preserved-runtime'\n")
    env = {**os.environ, **dict.fromkeys(names, "LOCAL"), "CERTICHAT_REFRESH": "12", "CERTICHAT_QUESTIONS": "42",
           "CERTICHAT_INDEX_REFRESH_MINUTES": "7",
           "CERTICHAT_INDEX_BUDGET_USD": "12.50", "CERTICHAT_CHAT_BUDGET_USD": "9.25",
           "CERTICHAT_INDEX_MODEL": "anthropic/claude-haiku-5.5", "CERTICHAT_CHAT_MODEL": "openai/gpt-5.4",
           "CERTICHAT_INDEX_REASONING": "high", "CERTICHAT_CHAT_REASONING": "medium",
           "CERTICHAT_INDEX_MAX_TOKENS": "16384", "CERTICHAT_CHAT_MAX_TOKENS": "8192",
           "CERTICHAT_DATA_DIR": "/data/claude55-haiku"}
    for _ in range(2):
        result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, timeout=15)
        assert result.returncode == 0, result.stderr
        assert result.stdout.splitlines() == list(expected)
        values = dict(line.split("=", 1) for line in private.read_text().splitlines() if "=" in line)
        assert [values[name].strip("'") for name in names] == list(expected)
        assert values["OPENROUTER_API_KEY"] == "'test-provider-key'"
        assert values["CERTICHAT_TURNSTILE_SECRET"] == "'test-turnstile-key'"
        assert values["CERTICHAT_POSTGRES_ADMIN_PASSWORD"] == "'preserved-admin'"
        assert values["CERTICHAT_POSTGRES_RUNTIME_PASSWORD"] == "'preserved-runtime'"
        assert sum(line.startswith("CERTICHAT_MODE=") for line in private.read_text().splitlines()) == 1
    preserved = private.read_text()
    for name, invalid in (("CERTICHAT_REFRESH", "25"), ("CERTICHAT_QUESTIONS", "0"), ("CERTICHAT_QUESTIONS", "101"),
                          ("CERTICHAT_INDEX_REFRESH_MINUTES", "0"), ("CERTICHAT_INDEX_REFRESH_MINUTES", "16"),
                          ("CERTICHAT_INDEX_REFRESH_MINUTES", "1.5"),
                          ("CERTICHAT_INDEX_BUDGET_USD", "NaN"), ("CERTICHAT_CHAT_BUDGET_USD", "0"),
                          ("CERTICHAT_CHAT_BUDGET_USD", "0.001")):
        result = subprocess.run(["bash", str(script)], env={**env, name: invalid}, capture_output=True, text=True, timeout=15)
        assert result.returncode != 0
        assert private.read_text() == preserved


@pytest.mark.skipif(sys.platform == "win32", reason="Run Linux shell checks through scripts/certichat-local.ps1 -Test")
def test_local_refresh_uses_configured_interval_and_only_manifest():
    compose = (Path(__file__).resolve().parents[1] / "compose.yml").read_text()
    service = compose.split("\n  local-refresh:\n", 1)[1].split("\n  volume-init:", 1)[0]
    command = service.split("command: ['", 1)[1].split("']", 1)[0].replace("$$", "$")
    # Stop after one cycle; print the actual command instead of invoking Python or the network.
    stub = 'python() { printf "%s\\n" "$*"; }; sleep() { printf "sleep %s\\n" "$*"; exit 0; }; '
    env = {**os.environ, "CERTICHAT_MODE": "LOCAL", "CERTICHAT_INDEX_REFRESH_MINUTES": "7"}
    local = subprocess.run(["sh", "-c", stub + command], env=env,
                           capture_output=True, text=True, timeout=5)
    assert local.returncode == 0 and local.stdout.splitlines() == ["-m app.indexer refresh", "sleep 420"]
    vps = subprocess.run(["sh", "-c", stub + command], env={**env, "CERTICHAT_MODE": "VPS"},
                         capture_output=True, text=True, timeout=5)
    assert vps.returncode == 1 and not vps.stdout
    for value in ("", "0", "16", "1.5", "$(exit 0)"):
        invalid = subprocess.run(["sh", "-c", stub + command], env={**env, "CERTICHAT_INDEX_REFRESH_MINUTES": value},
                                 capture_output=True, text=True, timeout=5)
        assert invalid.returncode == 1 and not invalid.stdout


@pytest.mark.skipif(sys.platform == "win32", reason="Run Linux shell checks through scripts/certichat-local.ps1 -Test")
def test_timer_installation_validates_interval_and_restarts_both_timers(tmp_path):
    source = (Path(__file__).resolve().parents[1] / "install-timer.sh").read_text()
    private = tmp_path / "service.env"
    units = tmp_path / "units"
    units.mkdir()
    log = tmp_path / "systemctl.log"
    source = source.replace("/opt/jarvis/apps/certichat/services/certichat/.env", str(private))
    source = source.replace("/etc/systemd/system", str(units))
    script = tmp_path / "install-timer.sh"
    script.write_text(f'id() {{ echo 0; }}\nsystemctl() {{ printf "%s\\n" "$*" >> {shlex.quote(str(log))}; }}\n' + source)
    for setting, expected in (("", 5), ("CERTICHAT_INDEX_REFRESH_MINUTES='7'\n", 7),
                              ("CERTICHAT_INDEX_REFRESH_MINUTES=15\n", 15)):
        private.write_text(setting)
        result = subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=5)
        assert result.returncode == 0, result.stderr
        for name in ("index", "manifest"):
            assert f"OnUnitActiveSec={expected}min" in (units / f"certichat-{name}.timer").read_text()
        assert log.read_text().splitlines()[-3:] == [
            "daemon-reload", "enable certichat-index.timer certichat-manifest.timer",
            "restart certichat-index.timer certichat-manifest.timer"]
    previous = {file.name: file.read_text() for file in units.iterdir()}
    calls = log.read_text()
    marker = tmp_path / "must-not-exist"
    for value in ("0", "16", "1.5", f"$(touch {marker})"):
        private.write_text(f"CERTICHAT_INDEX_REFRESH_MINUTES='{value}'\n")
        result = subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=5)
        assert result.returncode != 0
        assert {file.name: file.read_text() for file in units.iterdir()} == previous
        assert log.read_text() == calls and not marker.exists()


@pytest.mark.skipif(sys.platform == "win32", reason="Run Linux shell checks through scripts/certichat-local.ps1 -Test")
@pytest.mark.parametrize("fault", ["none", "sigterm", "sigterm_failed", "zero_failed", "oom", "killed", "unexpected", "activate", "candidate", "prepare", "prepare_failed", "prepare_signal", "build_failed", "unchanged"])
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
operation = next((arg for arg in args if arg in ('plan','prepare','build','changed','activate','rollback','stop','up','ps','inspect','logs')), 'unknown')
with log.open('a') as stream:
    stream.write(operation + '\\n')
fault = os.environ['FAULT']
if operation == 'plan': print('prepare' if fault.startswith('prepare') else 'ready' if fault == 'unchanged' else 'build')
if operation == 'changed': print('no' if fault == 'unchanged' else 'yes')
if operation == 'prepare' and fault == 'prepare_failed': sys.exit(1)
if operation == 'prepare' and fault == 'prepare_signal':
    import signal
    os.kill(os.getppid(), signal.SIGTERM)
if operation == 'build' and fault == 'build_failed': sys.exit(1)
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
    assert result.returncode == (143 if fault == "prepare_signal" else 0 if fault in ("none", "sigterm", "prepare", "unchanged") else 1), result.stderr
    if fault == "unchanged":
        assert calls == ["plan", "changed"]
        return
    if fault == "build_failed":
        assert calls == ["plan", "build"]
        return
    assert "up" in calls
    if fault in ("killed", "sigterm_failed", "zero_failed", "oom", "unexpected"):
        assert "activate" not in calls
    elif fault == "candidate":
        assert "rollback" in calls and calls.count("up") == 2
    elif fault == "activate":
        assert "rollback" not in calls and calls.count("up") == 1
    elif fault == "prepare":
        assert calls.index("stop") < calls.index("prepare") < calls.index("up") < calls.index("build")
        assert calls.count("stop") == 2 and calls.count("up") == 2
    elif fault in ("prepare_failed", "prepare_signal"):
        assert calls[-1] == "up" and "activate" not in calls and "build" not in calls
