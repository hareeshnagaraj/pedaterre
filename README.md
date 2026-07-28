# pedaterre

**Every New York City tax block, drawn from the assessment roll.**
Building height is assessed market value.

→ **[pedaterre.vercel.app](https://pedaterre.vercel.app)**

Type an address and see the tax block it sits on rendered as an isometric
skyline, where each building's height is what the Department of Finance says
that property is worth. Assessed market value only — never a sale price, an
appraisal, or an estimate.

## What's in it

| | |
|---|---|
| **Block view** | Isometric skyline and a thermal treemap of one block, plus a share card |
| **`/map`** | All 28,787 located blocks at true coordinates, sized by land area. Toggle between total value and value per square foot — the two maps look nothing alike |
| **`/top`** | Every block ranked. The most valuable is JFK Airport |
| **`/club`** | The 2,821 tax lots assessed above $50M — 0.24% of lots carrying 23.5% of citywide value |
| **`/game`** | Two blocks, no numbers. Guess which one the roll values higher |
| **`/sources`** | Every figure, its definition, and the record it comes from |

**`AS PERMITTED`** on any block raises the unbuilt-but-legal floor area as
translucent glass above the real buildings. Manhattan alone is sitting on
571 million square feet of it; citywide it is 8.7 billion.

## The data

FY2027 final assessment roll — 1,167,962 tax lots across 28,798 blocks,
$1,911,446,867,962 in assessed market value.

- **[DOF Property Valuation and Assessment Data](https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data-Tax-Classes/8y4t-faws)** — the roll
- **[PLUTO](https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO/64uk-42ks)** — coordinates, lot area, zoning capacity
- **[GeoSearch](https://geosearch.planninglabs.nyc/)** — address to borough/block/lot

Rankings, groupings, and ratios are derived; how each one is computed is
documented on [`/sources`](https://pedaterre.vercel.app/sources) rather than
left implicit.

## Running it

```bash
# 1. pull the roll and PLUTO (~250MB, gitignored)
./scripts/etl/download.sh
./scripts/etl/download-pluto.sh

# 2. build the static data tree: 3,585 bucket files + indexes
python3 scripts/etl/build.py          # stdlib only, ~30s, deterministic

# 3. run
cd apps/web && npm ci && npm run dev
```

Tests: `python3 -m unittest discover scripts/etl/tests` and, in `apps/web`,
`npm test` plus `npx playwright test`.

The ETL asserts its own anchors — row count, block count, the exact citywide
total, and the $50M club count are recomputed two structurally different
ways and must agree, so a silent regression fails the build rather than
shipping a wrong number.

## Notes on how it was built

- **[`TASTE-BAR.md`](./TASTE-BAR.md)** — the design and copy standard. Every
  review finding has to quote a clause from it; un-anchored opinion doesn't
  count as a violation. It exists because "that looks AI-generated" is
  unfalsifiable and therefore loses arguments it should win.
- **[`HANDOFF.md`](./HANDOFF.md)** — the original locked product decisions.
- **[`PLAN.md`](./PLAN.md)** — the execution plan and the review rounds that
  reshaped it, including the things they got wrong.

## License

MIT
