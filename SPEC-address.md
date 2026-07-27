# SPEC — WS3: real-data wiring + address search (dispatch after WS1a merge)

Objective: the workstream that makes the merged app render REAL data — the
gap round-2 spar identified: without this spec, all three other gates pass
while production renders six fixtures and a 404ing OG route. Read PLAN.md
"Design contract" D-3, D-7, D-12, D-13, "Round 2 — /spar" table, and the
Eng phase R-1/R-2 — binding.

## 0. Deploy mode (decided; verify, don't change)
Standard Next.js build on Vercel — NOT `output: 'export'`. All pages
statically generated where possible; the ONLY function is `/api/og/...`
(edge). If `next.config.*` says otherwise after WS1a merge, fix it here.

## 1. Data publication (the missing wiring)
- `npm run sync-data` (root or apps/web script): rsync
  `data/generated/buckets/**` → `apps/web/public/data/buckets/**` and
  `data/generated/index/city-stats.json` + `meta.json` →
  `apps/web/public/data/`. Runs in `prebuild`. Build FAILS loudly if
  buckets are absent (no silent fixture-only prod).
- `apps/web/lib/data.ts`: `fetchBlock(boro, block)` → fetch
  `/data/buckets/{boro}/{Math.floor(block/10)}.json`, pick block key,
  zod-parse (WS1a's schema), typed errors: `BLOCK_MISSING` (bucket 404 or
  key absent) vs `NETWORK` (fetch reject/timeout 8s, AbortController on
  nav). Client cache: in-memory per bucket.

## 2. Production block route
- `/b/[boro]/[block]?lot=` — server component renders wordmark + block
  identity header (borough name, block number, addressHint if present)
  BEFORE any client JS (D-13 deep-link SSR); client island loads payload
  via fetchBlock and mounts WS1a's BlockViz + WS1b's states:
  loading → LoadingState; BLOCK_MISSING → BlockMissingState; NETWORK →
  NetworkErrorState; success → viz + card; `?lot=` not in `lotToGroup` →
  PartialNotice + zero YOU claims.
- YOU resolution: `lotToGroup[lot]` covers unit lots AND R0 billing lots
  (75xx from GeoSearch). Match → mark that group `you: true` client-side,
  label per D-1 (`YOUR PROPERTY GROUP · n lots · $X combined` when
  nLots > 1; `YOUR LOT` when 1).
- Result footer: `Look up your block` CTA + 2 curated block links (read
  `top25Taxable` from city-stats, pick #1 + the current borough's top).
- `<meta property="og:image" content="/api/og/{boro}/{block}">` +
  utilitarian title/description per HANDOFF §10-F.

## 3. Address search (landing)
- GeoSearch v2 ONLY — v1 is HTTP 410. Endpoint:
  `https://geosearch.planninglabs.nyc/v2/autocomplete?text={q}` (as-you-
  type, debounced 250ms, min 3 chars) and `/v2/search` on submit.
  Client-direct fetch (CORS verified `access-control-allow-origin: *`).
  BBL lives at `features[].properties.addendum.pad.bbl` (10 digits:
  boro 1 + block 5 + lot 4). Parse defensively: addendum absent →
  EmptyState path.
- Accessible combobox per D-5 (aria-activedescendant pattern, keyboard
  up/down/enter/escape); dropdown styled with tokens (void bg, ink text,
  stamp highlight on active option). States: typing/empty/error per
  WS1b components. Input also accepts raw BBL (`1-01398-0021` or 10
  digits) → parse directly, skip GeoSearch.
- On resolve: router.push `/b/{boro}/{block}?lot={lot}` (strip leading
  zeros for the URL).
- Landing citywide strip reads city-stats.json (never hard-coded); demo
  buttons → two real curated blocks from top25Taxable + `/?demo=` keeps
  fixture mode for regression.

## 4. Thumb adapter + OG refs (integration glue, small)
- `apps/web/lib/share/thumbAdapter.ts`: bind WS1a's skyline renderer into
  WS1b's `drawSkylineThumb(ctx, payload, w, h)` parameter shape (fixed
  camera, no interaction, deterministic). Re-render WS1b's reference PNGs
  with the real adapter; leave the updated refs uncommitted for review.
- Shared `apps/web/lib/share/cardLayout.ts`: extract WS1b's layout
  constants (geometry, strings, truncation) and make BOTH the canvas
  composer and the OG JSX consume it (structural-drift guard per Round 2
  reconciliation). Refactor only — no visual change.

## Acceptance
1. `npm run build` green with real buckets present; build fails without.
2. 10-address matrix resolves end-to-end (2 per borough, incl. a Queens
   hyphenated address, a Manhattan range address `41-53 Fulton St`, a
   condo address that must land with a non-zero YOU group, one raw-BBL
   entry): each reaches `/b/...` with LIVE data, correct states.
3. `/b/1/1398?lot=1010`-style condo deep link shows PARTIAL only if the
   lot is genuinely absent; billing-lot BBLs resolve to their group.
4. Playwright: deep-link cold load shows SSR header before hydration;
   BLOCK_MISSING and NETWORK states reachable via mocks.
5. `grep -ri "block worth" apps/` empty; no AI attribution; no hard-coded
   citywide numbers (grep for `1911` and `2,821`/`2821` literals in
   apps/ must return nothing).

## Boundaries
Own: `apps/web/app/b/**`, `apps/web/app/page.tsx` search wiring,
`apps/web/lib/data.ts`, `apps/web/lib/geosearch.ts`,
`apps/web/lib/share/thumbAdapter.ts`, `cardLayout.ts` refactor, root
`sync-data` script. Do NOT touch: `lib/viz/**` internals (WS1a),
`components/states/**` internals (WS1b), scripts/etl (WS2), data/
(read-only). Do not commit.
