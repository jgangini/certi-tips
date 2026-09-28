# Initial architecture decision · 2026-09-28

CertiTips is a static site. Markdown and the course catalog enter a build script; markdown-it parses the chapters; a shared layout renders static HTML. The browser adds navigation, an accessible native diagram dialog and a quiz. A pure quiz module owns selection, confirmation, restoration and scoring. Storage failures fall back to memory. There is no backend or browser-loaded third-party runtime.

The validator checks published artifacts, editorial coverage and the question bank by responsibility in one script. Tests use Node's built-in runner. Browser smoke tests exercise the deployed paths and controls without screenshots.

## Bootstrap gate comparison

The initial Sentrux baseline was saved when the repository contained only the two architecture wrappers: quality 9952, no imports, no complex functions. It is deliberately retained, rather than overwritten to make the new application appear unchanged.

The first implementation necessarily introduces parsing, rendering, state validation and imports between source and test files. The first comparison reported lower quality/coupling scores, zero cycles and zero god files. The validator was then separated into focused validation functions to address its real reviewability problem.

For this initial release, the increase from an empty scaffold to an application is an **intentional, documented architectural tradeoff**. A DEGRADED result against the bootstrap baseline is reported as such, not as a passed gate. Acceptance also requires working behavioral tests, no dependency cycles or god files, and review of the new functions. No architecture rules are invented; `.sentrux/rules.toml` was absent, so the rule check has no configured contract to evaluate.

Future work should save its own preflight baseline against this working application. It must not use this initial-release exception to justify later regressions.
