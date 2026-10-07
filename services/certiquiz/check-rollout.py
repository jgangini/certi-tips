"""Check release replacement and recovery with fake Docker/curl, never a real VPS."""

import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile


source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parents[2] / "scripts/certiquiz-deploy.ps1"
remote = re.search(r"\$remote = @'\r?\n(.*?)\r?\n'@", source.read_text(), re.S).group(1)


def check(previous, fail):
    with tempfile.TemporaryDirectory(prefix="certiquiz-rollout-") as temporary:
        root = Path(temporary)
        app = root / "apps/certiquiz"
        backup = root / "backups/certiquiz/release-check"
        failed = root / "backups/certiquiz/failed-check"
        app.parent.mkdir()
        if previous:
            service = app / "services/certiquiz"
            (service / ".private").mkdir(parents=True)
            (service / ".env").write_text("private previous environment\n")
            (service / ".env").chmod(0o600)
            (service / ".private/host-access.txt").write_text("previous host access")
            (service / "compose.yml").write_text("services: {}\n")
            (app / "obsolete.txt").write_text("old release")
        archive = root / "candidate.tar.gz"
        with tarfile.open(archive, "w:gz") as release:
            files = {"services/certiquiz/deploy.sh": f"#!/bin/bash\ntest \"$CERTIQUIZ_PUBLISH_PROXY\" = false\nexit {int(fail)}\n",
                     "services/certiquiz/update-caddy.sh": "#!/bin/bash\nexit 0\n",
                     "services/certiquiz/compose.yml": "services: {}\n", "new.txt": "new release"}
            for name, contents in files.items():
                item = tarfile.TarInfo(name)
                item.size = len(contents.encode())
                release.addfile(item, io.BytesIO(contents.encode()))
        commands = root / "commands.log"
        bin_dir = root / "bin"
        bin_dir.mkdir()
        docker = bin_dir / "docker"
        docker.write_text("""#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
with pathlib.Path(os.environ['CHECK_COMMANDS']).open('a') as output:
    output.write(' '.join(args) + '\\n')
if args[:2] == ['ps', '-aq']:
    print('previous-api')
elif args and args[0] == 'inspect':
    print('certiquiz-api:local' if '.Config.Image' in args[2] else 'sha256:previous')
elif 'pg_dump' in ' '.join(args):
    assert not sys.stdin.read(), 'Docker must not consume the remaining SSH deployment script.'
    print('fake consistent database backup')
elif 'pg_restore' in args:
    assert '--list' in args and sys.stdin.read(), 'Only backup inspection is permitted.'
""")
        docker.chmod(0o700)
        curl = bin_dir / "curl"
        curl.write_text("#!/bin/sh\nexit 0\n")
        curl.chmod(0o700)
        script = remote.replace("/opt/jarvis/apps", str(root / "apps")).replace("/opt/jarvis/backups", str(root / "backups"))
        script = script.replace("__ID__", "check").replace("__ARCHIVE__", str(archive)).replace("__PUBLISH_PROXY__", "false")
        assert "/opt/jarvis" not in script
        result = subprocess.run(["bash", "-s"], input=script, env=os.environ | {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
                                "CHECK_COMMANDS": str(commands)}, capture_output=True, text=True)
        assert (result.returncode != 0) == fail, result.stdout + result.stderr
        if previous and fail:
            assert (app / "obsolete.txt").exists() and (failed / "new.txt").exists()
            assert "tag certiquiz-api:rollback-check certiquiz-api:local" in commands.read_text()
            assert (app / "certiquiz.dump").stat().st_mode & 0o077 == 0
        elif previous:
            assert not (app / "obsolete.txt").exists() and (backup / "obsolete.txt").exists()
            assert (backup / "certiquiz.dump").stat().st_mode & 0o077 == 0
        else:
            assert (app / "new.txt").exists(), "Initial failures must preserve setup for retry."
        if previous:
            assert (app / "services/certiquiz/.private/host-access.txt").read_text() == "previous host access"
            assert (app / "services/certiquiz/.env").stat().st_mode & 0o077 == 0


for scenario in ((True, False), (True, True), (False, True)):
    check(*scenario)
print("CertiQuiz rollout checks passed: clean replacement, API rollback, initial failure retention.")
