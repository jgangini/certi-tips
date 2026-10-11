#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/apps/certichat
umask 077
exec 9>/opt/jarvis/backups/certichat/deploy.lock
flock -n 9 || exit 0
compose=(docker compose --project-directory "$PWD" --env-file services/certichat/.env -p certichat -f services/certichat/compose.yml)
"${compose[@]}" run --rm --no-deps indexer build
changed=$("${compose[@]}" run --rm --no-deps indexer changed)
if [[ "$changed" != yes ]]; then exit 0; fi
# SIGTERM drains the one worker before another process opens its embedded databases.
"${compose[@]}" stop -t 55 knowledge
container=$("${compose[@]}" ps -aq knowledge)
clean=false
if [[ -n "$container" ]] && read -r code oom started < <(docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}} {{.State.StartedAt}}' "$container"); then
  # Uvicorn re-raises SIGTERM after lifespan shutdown; 143 is valid only with this run's completion marker.
  if [[ "$code" =~ ^(0|143)$ && "$oom" == false ]] &&
     docker logs --since "$started" "$container" 2>&1 | grep -F 'Application shutdown complete.' >/dev/null; then
    clean=true
  fi
fi
if [[ "$clean" != true ]]; then
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
  echo 'Knowledge did not stop cleanly; activation was refused.' >&2
  exit 1
fi
if ! "${compose[@]}" run --rm --no-deps indexer activate; then
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
  echo 'Activation failed before restart; existing active pointer retained.' >&2
  exit 1
fi
if ! "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge; then
  "${compose[@]}" stop -t 55 knowledge
  if "${compose[@]}" run --rm --no-deps indexer rollback; then
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
    echo 'Candidate failed to open; previous knowledge snapshot restored.' >&2
  else
    echo 'Knowledge activation failed; no previous snapshot is available.' >&2
  fi
  exit 1
fi
echo 'CertiChat published knowledge snapshot activated.'
