#!/usr/bin/env bash
set -euo pipefail
cd /opt/jarvis/apps/certichat
umask 077
exec 9>/opt/jarvis/backups/certichat/deploy.lock
flock -n 9 || exit 0
compose=(docker compose --project-directory "$PWD" --env-file services/certichat/.env -p certichat -f services/certichat/compose.yml)
stopped=false
restore_worker() {
  status=$?
  trap - EXIT
  if [[ "$stopped" == true ]]; then
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge || true
  fi
  exit "$status"
}
trap restore_worker EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
stop_knowledge() {
# SIGTERM drains the one worker before another process opens its embedded databases.
stopped=true
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
  stopped=false
  echo 'Knowledge did not stop cleanly; activation was refused.' >&2
  return 1
fi
}
plan=$("${compose[@]}" run --rm --no-deps indexer plan)
if [[ "$plan" == prepare ]]; then
  stop_knowledge
  # Resume serving the original as soon as its consistent candidate copy is prepared.
  if ! "${compose[@]}" run --rm --no-deps indexer prepare; then
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
    stopped=false
    echo 'Candidate preparation failed; original knowledge retained.' >&2
    exit 1
  fi
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
  stopped=false
elif [[ "$plan" != build && "$plan" != ready ]]; then
  echo 'Invalid indexing plan.' >&2
  exit 1
fi
if [[ "$plan" != ready ]]; then "${compose[@]}" run --rm --no-deps indexer build; fi
changed=$("${compose[@]}" run --rm --no-deps indexer changed)
if [[ "$changed" != yes ]]; then exit 0; fi
stop_knowledge
if ! "${compose[@]}" run --rm --no-deps indexer activate; then
  "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
  stopped=false
  echo 'Activation failed before restart; existing active pointer retained.' >&2
  exit 1
fi
if ! "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge; then
  "${compose[@]}" stop -t 55 knowledge
  if "${compose[@]}" run --rm --no-deps indexer rollback; then
    "${compose[@]}" up -d --no-deps --wait --wait-timeout 120 knowledge
    stopped=false
    echo 'Candidate failed to open; previous knowledge snapshot restored.' >&2
  else
    echo 'Knowledge activation failed; no previous snapshot is available.' >&2
  fi
  exit 1
fi
stopped=false
echo 'CertiChat published knowledge snapshot activated.'
