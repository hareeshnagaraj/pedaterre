# SPEC — WS5: the city map (`/map`) + block locator

Objective: a citywide view where NYC draws itself out of its own tax record.
No basemap, no tiles, no map library, no API key. Every one of the 28,798
blocks is plotted at its true coordinates, sized by its real land area, and
colored by value. Read PLAN.md's design contract (tokens, dry municipal
register, restraint) and study `apps/web/app/top/page.tsx` and
`components/BlockViz.tsx` before writing anything — match those patterns.

## 1. Geometry ingest (new)

`scripts/etl/download-pluto.sh`, modeled exactly on `download.sh`:
pull NYC PLUTO (`64uk-42ks`, 858,602 rows) paged by `$order=:id`,
`$select=borough,block,lot,latitude,longitude,lotarea`, 500k/page, into
`data/raw/pluto-page-*.csv` + sha256 + meta. Borough arrives as a code
(`MN|BX|BK|QN|SI`) — map to 1–5.

`scripts/etl/build.py` gains a geometry stage:
- Aggregate PLUTO lots to blocks: centroid = mean of member lot lat/lon
  (skip rows with blank/zero coords), `landArea` = sum of `lotarea`.
- Join to the existing block aggregates by (boro, block). Report coverage:
  how many of the 28,798 blocks got coordinates, how many did not. Blocks
  without coordinates are **omitted from the map and counted in meta**, never
  silently dropped or placed at 0,0.
- Emit `data/generated/index/block-map.json`: a compact columnar payload
  (parallel arrays, not objects) — `b` (borough 1-5), `k` (block), `x`/`y`
  (lon/lat quantized to integers: `round((lon + 74.3) * 100000)` and
  `round((lat - 40.4) * 100000)`), `m` (totalM, 1dp), `a` (landArea sqft),
  `d` (dollars per sqft of land, 1dp, null when landArea is 0), `t`
  (taxable 0/1), `r` (rank). Quantization + columnar layout is what keeps
  this near ~1MB rather than several.
- Tests: coverage ratio reported and asserted > 0.95; every emitted block
  exists in the bucket tree; coordinates fall inside NYC's bounding box
  (lat 40.47–40.93, lon −74.30–−73.68); density is null exactly when
  landArea is 0; determinism holds (existing hash test must still pass).

Extend `apps/web/scripts/sync-data.mjs` to copy `block-map.json`.

## 2. `/map` — the page

Server shell + client canvas island, same shape as `/top`.

**Projection:** no library. Equirectangular with longitude scaled by
`cos(40.73°)` so the city isn't stretched. Fit all points to the viewport on
load, then free pan/zoom (wheel + pinch + drag).

**Glyphs:** each block is a square centered on its centroid with side
`sqrt(landArea)` in world units, floored to a minimum on-screen size (~2px)
so small blocks stay visible when zoomed out. At city zoom the sheer density
of blocks draws the street grid and shoreline; zoomed in, squares approach
true relative footprint. Fill from the existing thermal ramp
(`lib/viz/color.ts`) — reuse it, do not invent a second palette.

**The toggle — this is the point of the page:** `TOTAL VALUE` ↔
`PER SQUARE FOOT`. Total answers "where is the money"; per-square-foot
answers "where is land actually expensive", and the two maps look nothing
alike. Ramp normalization is per-metric (log-scaled for total, log-scaled
for density) and the legend states the scale in dollars.

**Interaction:** hover → tooltip with borough, block, address hint, value,
$/sqft. Click → `/b/{boro}/{block}`. Borough filter chips reused from
`/top`. A text filter is not required here.

**Hit testing:** build a uniform spatial-hash grid over world coordinates
once; hover looks up one cell. Never linear-scan 28,798 glyphs per
mousemove.

**Editorial pins (4–6, defined in a small data file, not hard-coded prose in
the component):** short deadpan annotations anchored to real blocks, each
verifiable — the airport that tops the register, the single-lot stadium,
Central Park, the densest-by-$/sqft block in the city. Pins are quiet:
hairline leader, small caps, no bubbles.

**Mobile:** full-height canvas, `touch-action: none` is acceptable HERE
(it's a map, panning is the point) but the page must not trap the document
scroll — give the canvas a bounded height with the legend and toggle
outside it, matching the `/b` page's discipline.

**a11y:** the canvas is not the only path. Below it, a visually compact but
real DOM list of the top 50 blocks by the active metric, keyboard reachable,
linking to the same pages. Toggle and filters are real buttons with
`aria-pressed`.

## 3. Block-page locator + outbound links

On `/b/[boro]/[block]`, in the existing footer region:
- **Locator:** a small canvas (about 240×160) showing all blocks as faint
  points with this block marked in `--you` cyan, captioned
  `THIS BLOCK, IN THE CITY`. Click → `/map` centered on it
  (`/map?b={boro}&k={block}`; the map reads those params and centers/zooms).
- **Outbound links**, plain text, dry labels: `NYC Property Information
  Portal` (`https://propertyinformationportal.nyc.gov/parcels/parcel/{bbl10}`
  using the 10-digit BBL of the block's largest lot), and `Street View`
  (`https://www.google.com/maps/search/?api=1&query={lat},{lon}` using the
  block centroid). External links get `rel="noopener noreferrer"`.

Also add `/map` to the landing page nav alongside the existing register link.

## Acceptance
- `python3 -m unittest discover scripts/etl/tests` green (existing 20 + new).
- `cd apps/web && npm run build && npm test` green.
- `npx playwright test` green, plus one new spec: `/map` renders, the
  toggle changes the rendered image (compare canvas data-URL hashes before
  and after), a click on a known glyph navigates to the right block page,
  and the locator on `/b/1/1171` renders and links to `/map?b=1&k=1171`.
- `grep -ri "block worth" apps/` empty. No AI attribution. No hard-coded
  citywide stat literals.
- Report the geometry coverage number in the build summary.

## Boundaries
Own: `scripts/etl/download-pluto.sh`, geometry stage in `build.py` + its
tests, `apps/web/app/map/**`, `apps/web/components/CityMap.tsx` and
`BlockLocator.tsx`, `apps/web/lib/cityMap.ts`, sync-data, and minimal
additions to the landing nav and the `/b` footer. Do not restructure
`lib/viz/**`, `lib/share/**`, `components/states/**`, or the ETL's existing
block/bucket logic. Do not commit.
