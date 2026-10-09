# Local Codex Policy for codex-oci-mylearn

This file supplements the global `~/.codex/AGENTS.md`.

Keep this file repo-specific. Do not duplicate universal rules that already live in the global policy.

## Project Identity

CertiTips publishes Spanish study guides and explained practice at `/certi-tips/` in `jgangini/certi-tips`. Use Node.js 24 and the existing Markdown build; no backend or browser framework is needed. Keep source transcripts outside this repository.

Repository checks: `npm run build`, `npm test`, `npm run check`. The checker validates the 53 source lessons, 36 questions, 9 diagrams, paths and anchors. Rebuild/check even for headings-only edits. `dist/` is generated and replaced on build.

Use `npm test` with its in-process Node runner: default test isolation hits `spawn EPERM` in this Windows sandbox. Tests must restore any changed global state. Browser QA uses the isolated CLI session and `scripts/browser-smoke.cjs`, without screenshots.

Quiz reviews must retain their exact original completed practice. The initial architecture delta against the two-wrapper bootstrap is documented in `docs/architecture.md`; future work must baseline the working application.

- Repo root: `D:\dev\codex-oci-mylearn`
- Purpose:
- Technical audience:
- Primary surfaces:

## Repo Operating Defaults

- Preferred validation commands:
- Preferred search and inspection tools:
- Default runtime or environment assumptions:

## Local Validation Policy

- Required checks beyond global Graphify and Sentrux:
- Safe shortcuts for docs-only work:
- Release, deploy, or approval gates:

## Repo-Specific Friction

- Diagram QA must check the meaning of each pictogram, not only text bounds and successful loading. Two visual reviews missed agent icons represented as refresh/check symbols. Keep agents (`bot`) distinct from models (`cpu`), runtimes and loop arrows. Report DOM/geometry validation separately from screenshot-based visual review; screenshots remain prohibited unless explicitly requested as a deliverable.

- Sensitive paths or fragile areas:
- Credentials, external systems, or approval boundaries:
- Noisy, slow, or expensive commands to avoid by default:

## Continuous Improvement Triggers

- Promote a repeated friction to this local file after 2 recurrences in the same repo.
- Promote a repeated manual sequence to a script or skill after 3 recurrences or when it is safety-critical.
- Promote a rule to the global policy only when it is cross-repo or clearly universal.
- Review `.codex/improvement-log.md` before large tasks and record only meaningful signal after non-trivial work.

## Future Delegation Hooks

- Candidate explorer roles:
- Candidate reviewer roles:
- Candidate repo-specific skills or MCPs:

## Diagram composition checks

Repeated OCI reviews missed faint badges, detached captions and an off-center instance pool despite passing text-overlap checks. For native course SVGs, measure the complete artwork plus caption against its container, and the visible icon geometry against its nearest label. Check badge borders against both their fill and surrounding gradients. Use `scripts/diagram-check.cjs` for center, padding and horizontal/vertical proximity and `tests/diagram-design.test.mjs` for badge contrast; successful loading and collision-free text alone are insufficient.
