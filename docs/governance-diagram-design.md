# Governance diagram design

These rules apply to native `gov-*.svg` course diagrams. Keep other courses' visual systems intact.

## References and scope

- Modules 00–02 (`gov-overview-*`, `gov-governance-*`, `gov-data-architecture-*`) and `gov-data-modeling-concepts.svg` / `gov-data-modeling-principles.svg` are the approved references. Do not restyle them while applying this standard to another module.
- Reuse their existing SVG geometry and patterns. Edit the native SVG; do not regenerate a reviewed diagram with a broad source generator.
- Preserve the lesson's meaning, entities, cardinality, field relationships and direction. Keep the SVG `<title>` / `<desc>` and the lesson's image title / caption consistent.

## Composition and type

- Use a `1920 × 1080` viewBox and `#F1EFED` canvas. The title is 56 at `(96, 99)`; the red underline starts at `(96, 128)` and is `88 × 6`.
- Body text is at least 25.5 in the existing Segoe UI / Arial stack. Center the complete artwork below the title at `(960, 608)`, using `data-layout="module-artwork"` and `data-center="960 608"`.
- Measure rendered text boxes: baselines alone do not establish vertical centering. Keep a label on one line when it fits. Widen its column or reorganize the composition before reducing text size.
- Use rounded corners of 12–16. Align and center peer tables, their headers and related rows. When columns describe stages of one mechanism, prefer one shared frame with aligned column headings.
- Use compact, vertically centered notes and conclusions. Show a tabular count in one result row; add only the context needed to identify it. Avoid empty space below short tables.
- The client circle in `gov-data-modeling-concepts.svg` remains the reference when an entity is drawn as a circle: white fill, thin gray border, dark bold name above a red normal-weight identifier. Do not impose that circle on a tabular result.
- Peer cards in a shared stage frame align at both their top and bottom edges. Put each explanatory block directly beneath its own card with the same gap across columns.
- For dated state changes, reuse the Architecture timeline pattern: a white panel with a dark header, one continuous horizontal arrow, aligned milestone dots, compact state labels above and dark date labels below. Mark a withdrawal in red while keeping the state readable in text.
- Explanatory blocks use the Architecture reference: `#F1EFED` fill, gray 1.5-unit border, radius 12, centered normal-weight text. Its two-line variant is 116 high with 42 between baselines; record this reference explicitly when using the cell-height exception.

## Tables, tags and connectors

- Table bodies are white, headers `#59616E` with white labels, borders `#59616E` at 1.5. Use a simple header height of 64, simple rows of 52–56, and rows containing a 48-high tag of 72 (12 above and below). A header containing a service icon may be 80–96 high.
- Keep ordinary text cells left aligned unless the information benefits from horizontal centering. In either case, center the content vertically. Use at least 12 horizontal padding; simple text rows need at least 8 vertical padding with the actual font bounds. Headers and notes need at least 12 vertical padding.
- Tags use one line, normal-weight `#181818` text, white `#FFFFFF` fill, 1.5 gray border, radius 12 and height 48. Leave at least 12 horizontal padding and center the text vertically; the rendered font box determines vertical padding. Place connector tags about 16 from their associated line, without covering it or drifting to another relationship.
- Do not wrap ordinary table values in tags. Definition fields and values align left; state values use plain text, with `#2E7D32` for Vigente and `#C74634` for Suspendido. Keep the written state so color is supplementary. Decision-diamond questions use normal weight, not bold.
- Relationship connectors use solid `#59616E` lines, width 3 and directional arrowheads. Use 16-radius bends where a bend is necessary; align connected fields for straight paths whenever their meaning allows it. Separate routes so they do not collide.
- Header column separators are white. Body column dividers between stages are dashed gray; ordinary table row/cell rules remain thin gray. Do not confuse a divider with a relationship connector.
- Use exact, reviewed service icons as inline original geometry with a readable product label; `gov-governance-oracle.svg` is an available reference. Do not invent an Oracle Enterprise Data Management icon or relabel an unrelated service icon. Preserve source/manifest attribution when reusing catalogued icons.

## Measurable cell contract

For revised tables, mark each cell whose geometry should be checked:

```xml
<g data-table-cell="row">
  <rect data-cell-frame="true" x="100" y="300" width="320" height="54" fill="none" />
  <text data-cell-content="true" x="116" y="...">Field value</text>
</g>
```

- `data-table-cell` accepts `header`, `row`, `tag-row`, `icon-header` or `note`. Each group contains exactly one `data-cell-frame` shape and one `data-cell-content` element; the latter may be a group containing the icon, tag and/or text that should move together. Mark existing shapes when possible; a non-rendering frame may describe a logical cell.
- By default, the checker verifies containment, padding, vertical centering and the kind's height. Simple rows also check every text label independently; a tag background cannot mask displaced text. A `reference-tag` rectangle is followed by its text label, which is checked against the rectangle's center. Add `data-cell-align="center"` only when horizontal centering is intended. A `note` should be its content height plus 24–32.
- Use `data-cell-exception="specific semantic or layout reason"` only when an intentional multiline header, circular result or other mechanism needs a different height/wrapping rule. It does not excuse clipping, inadequate padding or misalignment. Do not add empty exemptions or use one to conceal an unexplained tall row.
- A multiline simple header is flagged when the full phrase fits on one line with normal padding. A necessary multiline header needs its documented exception; first consider a wider column.
- Unmarked diagrams are not reclassified automatically. Existing approved reference figures keep their established composition.

## Verification loop

1. Read the lesson and identify what each node, field, icon and arrow teaches before moving shapes.
2. Build the site, load the actual SVG and run `scripts/diagram-check.cjs` in the project's isolated browser workflow. It measures rendered DOM geometry, including marked cells. Inspect cell count as well as reported violations so missing marks cannot look like successful coverage.
3. Correct excessive row height, wrapped headers that fit, padding and real vertical centering; then rerun the focused DOM checks. Verify peer alignment, tag-to-line association, directional arrows and icon meaning individually.
4. Recheck `<desc>` / caption consistency and the existing repository tests/checks. Report measured verification separately from semantic review.

Never take screenshots for verification. Use DOM/accessibility state, geometry and reproducible checks; never substitute a generated mockup for the real SVG.
