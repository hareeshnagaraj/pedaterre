# SPEC — WS6: THE GHOST CITY (unbuilt air rights)

Objective: make zoning visible. On any block, toggle the skyline between
`AS BUILT` and `AS PERMITTED` — the real buildings stay solid, and the
legally-buildable-but-unbuilt volume rises above them as translucent glass
massing. Verified scale of the reveal: **Manhattan alone holds 571.4
million sq ft of unbuilt residential capacity across 28,540 lots — about
206 Empire State Buildings.**

Read PLAN.md's design contract and study `components/BlockViz.tsx`,
`lib/viz/projection.ts`, and `scripts/etl/build.py` before writing anything.
PLUTO is already downloaded to `data/raw/pluto-page-*.csv` (columns include
`lotarea, bldgarea, builtfar, residfar, commfar, facilfar, numfloors,
yearbuilt, bldgclass`). Do not re-download it.

## 1. The computation, and its honesty rules

Per PLUTO lot: `maxfar = max(residfar, commfar, facilfar)` — the most
permissive as-of-right envelope on that lot. Unbuilt capacity is
`max(0, (maxfar - builtfar)) * lotarea` square feet.

This is a **simplification of real zoning** and the product must say so.
Hard rules:
- Skip lots where `maxfar` is 0 or missing (unmapped/special districts) and
  count them as `unknownCapacity` — never treat unknown as zero.
- Skip lots where `lotarea` is 0.
- Do **not** convert square feet into dollars. A $/buildable-sqft multiplier
  is a modeling assumption, not a fact in the roll, and this product's whole
  position is that every number traces to a source. Square feet only.
- Emit the caveat text alongside the data so the UI cannot render the
  feature without it: as-of-right envelope only; ignores overlays, special
  districts, landmarks, air-rights transfers, and lot mergers; a lot showing
  capacity may be legally unable to use it.

## 2. ETL

Add an air-rights stage to `scripts/etl/build.py`, joined to blocks by
(boro, block):
- Per block: `builtSqft` (sum `bldgarea`), `capacitySqft` (sum of unbuilt),
  `unknownLots` (count skipped for missing FAR), `ghostRatio`
  (`capacitySqft / (builtSqft + capacitySqft)`, null when the denominator
  is 0).
- Add these to each block payload in the bucket tree, plus a per-group
  `ghost` figure so the renderer can raise ghost massing on the right
  towers (allocate a lot's capacity to the group that lot belongs to,
  reusing the existing lot→group mapping).
- Emit `index/ghost-stats.json`: citywide and per-borough totals plus the
  top 50 blocks by `capacitySqft`, and the Empire-State-equivalent divisor
  (2,768,591 sqft) as a named constant so the UI never hard-codes it.
- Tests: capacity is never negative; unknown lots are counted not zeroed;
  Manhattan's residential-only total reproduces ~571M sqft within 2% (the
  independently measured figure); a block with no PLUTO match reports null
  rather than 0; determinism holds.

## 3. Renderer

Extend `BlockViz` additively with a mode: `AS BUILT` (current behavior,
unchanged and default) and `AS PERMITTED`.

In `AS PERMITTED`, above each group's solid massing, draw its unbuilt
capacity as an extruded translucent volume in the same isometric
projection: low-alpha fill, hairline top edge, no fill texture, no window
grid, drawn in the same painter-depth order so ghosts occlude correctly.
It should read as architectural glass, not as a glow — restraint rules from
HANDOFF §4.3 apply with full force. Ghost height uses the same `hScale`
relationship as real massing so the two are visually comparable.

Transition between modes is a short height tween (respect
`prefers-reduced-motion`: instant).

Chrome: the mode control joins the existing toolbar as a third state
alongside Skyline/Thermal, or as a paired toggle within Skyline — your
call, but tabs stay outside the canvas and the legend stays HTML below it.
The legend gains one line explaining ghost massing, and the caveat text
from §1 is visible on the page (not hidden behind a tooltip).

Stat strip gains `UNBUILT CAPACITY` — square feet, plus the
Empire-State-equivalent when the block clears one.

## 4. Citywide

A section on `/top` (or a small block on the landing page — pick one, do
not build both): the top blocks by unbuilt capacity, with the citywide
figure stated in both square feet and Empire States. Deadpan copy.

## Acceptance
- `python3 -m unittest discover scripts/etl/tests` green including the new
  air-rights tests.
- `cd apps/web && npm run build && npm test` green; existing viz tests
  unchanged and passing.
- `npx playwright test` green plus a new spec: a block with known capacity
  renders visibly taller in `AS PERMITTED` than `AS BUILT` (compare canvas
  data-URL hashes), the caveat text is present in the DOM, and reduced
  motion skips the tween.
- `grep -ri "block worth" apps/` empty; no AI attribution; no dollar figure
  attached to air rights anywhere.

## Boundaries
Own: the air-rights stage in `build.py` + tests, additive `BlockViz` mode,
`lib/viz/ghost.ts`, the stat-strip and legend additions, and one citywide
section. Do not restructure `lib/share/**`, `components/states/**`,
`app/game/**`, or the existing bucket/grouping logic. Do not commit.
