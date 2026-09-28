# Initial architecture decision · 2026-09-28

CertiTips is a static site. Markdown and the course catalog enter a build script; markdown-it parses the chapters; a shared layout renders static HTML. The browser adds navigation, an accessible native diagram dialog and a quiz. A pure quiz module owns selection, confirmation, restoration and scoring. Storage failures fall back to memory. There is no backend or browser-loaded third-party runtime.

The validator checks published artifacts, editorial coverage and the question bank by responsibility in one script. Tests use Node's built-in runner. Browser smoke tests exercise the deployed paths and controls without screenshots.

## Bootstrap gate comparison

The initial Sentrux baseline was saved when the repository contained only the two architecture wrappers: quality 9952, no imports, no complex functions. It is deliberately retained, rather than overwritten to make the new application appear unchanged.

The first implementation necessarily introduces parsing, rendering, state validation and imports between source and test files. The first comparison reported lower quality/coupling scores, zero cycles and zero god files. The validator was then separated into focused validation functions to address its real reviewability problem.

For this initial release, the increase from an empty scaffold to an application is an **intentional, documented architectural tradeoff**. A DEGRADED result against the bootstrap baseline is reported as such, not as a passed gate. Acceptance also requires working behavioral tests, no dependency cycles or god files, and review of the new functions. No architecture rules are invented; `.sentrux/rules.toml` was absent, so the rule check has no configured contract to evaluate.

Future work should save its own preflight baseline against this working application. It must not use this initial-release exception to justify later regressions.

## Visual guide and navigation revision · 2026-09-28

This revision saved a fresh baseline against the working application: quality 7407, coupling 0.43, zero cycles and zero god files. The final comparison reports quality 7387 and coupling 0.50, still with zero cycles and zero god files. The only new resolved source import is `tests/layout.test.mjs` importing `scripts/layout.mjs` to verify the native sidebar tree, full heading URLs and removal of the duplicate in-page index. Production module dependencies remain unchanged; there is no framework, service or new package.

Keeping this direct regression test is an intentional, documented tradeoff: one additional test-to-production edge changes the cross-module ratio from 3/7 to 4/8. We retain the test rather than hiding it from the scanner or removing useful coverage to improve the ratio. The gate result remains **DEGRADED**, not passed. This decision is specific to the added navigation test, not an extension of the empty-project exception above.

The SVG text-bound check and the browser acceptance script verify the new visuals and user flows without screenshots. Raster illustrations are educational assets generated with imagegen, not evidence of a running system. Their technical meaning is qualified in the accompanying chapter text.
