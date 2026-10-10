# Improvement Log - codex-oci-mylearn

Use this file for evidence-backed harness improvements in this repo.

Keep entries short. Record real friction, recurring overhead, or meaningful improvements only.

## Promotion Thresholds

- 2 recurrences in this repo -> local `.codex/AGENTS.md` candidate
- 3 recurrences or safety-critical repetition -> script or skill candidate
- Cross-repo or clearly universal pattern -> global `~/.codex/AGENTS.md` candidate

## Entry Template

2026-10-09 — Three manual preflight runs needed an isolated Git index to match postflight's inclusion of new sources. Moved the same sequence into arch-preflight.ps1, including environment restoration and source-count output. Executed preflight and verified the real index hash stays unchanged; baseline and final gate now inspect the same source set without a manual wrapper.

2026-10-09 — Governance again added sources omitted by Sentrux's tracked-only scan (the MCP scan remained at 119 files). Promoted the already repeated isolated-index sequence into arch-postflight.ps1: it scans new files with existing sources, preserves real staging and restores Git environment variables. Tracked-only MCP results are supplementary; the expanded CLI gate is authoritative.

2026-10-09 — Chromium does not emit animationcancel for participant animations canceled during their initial delay. The isolated roster check caught arrivals stuck before absorption when reduced motion was enabled immediately after joining. Use one matchMedia change listener for the current roster instead of relying on cancellation events, and verify arrival timing with native browser animation events.

2026-09-29 — Two rounds of diagram geometry/load checks missed the same semantic defect: an agent represented by a refresh/check symbol in agents-objectives and langchain-objectives. Added a focused robot-pictogram regression check and repo guidance to review every icon's meaning, with DOM validation explicitly distinguished from visual evidence.

2026-09-28 — Node test isolation hit `spawn EPERM` in two independent runs (root and quiz agent). `npm test` now uses Node 24 in-process isolation; tests restore changed globals. Applied to local guidance and test command.

2026-09-28 — The Sentrux bootstrap baseline contains only two wrappers. The initial application adds imports and validation complexity; cycles and god files stayed zero. Split validator responsibilities and document the intentional initial delta without replacing the baseline. Recorded in `docs/architecture.md`.

| Date | Task or Incident | Friction Observed | Evidence | Action Taken or Proposed | Promotion Target | Status |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD |  |  |  |  | local AGENTS / script / skill / global AGENTS / none | captured |

2026-10-07 — Sentrux uses git ls-files and silently omitted 24 untracked CertiQuiz files. A tracked-only gate passed while the expanded scan reported coupling/complexity degradation. Used a temporary Git index plus object directory to include new files without touching the real staging area; documented the reviewed service tradeoff in docs/architecture.md. Proposed: pre/postflight should report untracked source coverage before claiming a complete architecture check.

2026-10-07 — OCI diagram bounds/overlap checks passed but missed top-aligned single-label cards and excessive title-description spacing in both IAM examples. Distinguished centered messages from container headings, reviewed all 49 OCI figures, and extended diagram-check.cjs with rendered center, padding, proximity and frame-border checks. Browser measured 57 centered cards and 118 label groups; no screenshots were taken. Future diagram reviews should inspect grouping and meaning as well as collisions.

2026-10-07 — CertiQuiz update exposed a safety-critical harness gap: docker compose exec inherited the SSH pipe and consumed the remaining deployment script. The old API stayed healthy; its source directory was restored before retrying. Backup/deploy subprocesses now receive /dev/null. check-rollout.py now feeds bash -s through stdin and makes the fake Docker backup consume input, matching the real transport. All three recovery scenarios and the corrected production update passed. Promotion target: existing rollout script/check, completed.
2026-10-07 — CertiQuiz capacity checks initially scheduled polls start-to-start, while the real frontend waits one second after each response and defers polling while sending an answer. The stronger synthetic cadence produced late answers; it was not an accurate 500-browser acceptance workload. The smoke now defaults to the actual browser schedule, records per-question delivery and polling gaps, retains the fixed-cadence stress mode and its failed result, and keeps response/deadline thresholds. The 500-browser run passed with 998 answers and no errors; no claim of constant 500 RPS or a VPS load test. Promotion target: existing scripts/certiquiz-smoke.mjs and architecture documentation, completed.

2026-10-07 — CertiQuiz avatar geometry checks verified a 56px parent and 50% border radius but missed the name overlay's percentage clip radius, which produced a rounded rectangle. Added DOM hit-mask checks for points inside and outside the circle; the check failed before the fixed 28px clip radius and passed afterward across both themes and four widths. Keep checking the rendered descendants when a clipping overlay changes the visible shape.

2026-10-07 — CertiQuiz browser hover verification waited for the 0.20 s name opacity transition, then checked the 0.25 s clipping transition before it finished. Wait for the final clip geometry as well. Local browser rooms also reached the per-network room ceiling; complete QA uses an isolated disposable API/database so user rooms remain untouched.

2026-10-07 — A second OCI composition review exposed issues beyond title spacing: gradients hid identity badges, icon captions were detached, and the horizontal scaling cluster was shifted inside its panel. Replaced 61 badge backgrounds/borders, compacted icon-label groups, centered complete scaling artwork, and reused the user-supplied key in all five matching images. Added contrast regression coverage and horizontal/vertical icon proximity to diagram-check.cjs; Browser DOM verified 49 SVGs, 77 centered cards and 129 icon-label pairs without screenshots. Promoted the repeated composition blind spot to local guidance.
