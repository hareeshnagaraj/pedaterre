# SPEC — WS1b: share composition + OG route + state system

Objective: build the product's viral artifact and its state anatomy as
standalone modules that merge cleanly onto WS1a's scaffold. Read PLAN.md
"Design contract" D-2, D-3, D-9, D-10, D-13 and HANDOFF §3.3 (card
content) + §8 (tone) — binding. This is NEW work: the mock's copy-image
button is a stub (`flash("Image ready (mock)")` at line 3105) — there is
nothing to port. The mock's card MARKUP (lines 650–679, CSS 349–410,
paper/stamp aesthetic) is the visual reference for the composition.

## File ownership (disjoint from WS1a by design)
Own ONLY: `apps/web/lib/share/**`, `apps/web/components/states/**`,
`apps/web/app/api/og/**`, and their tests. If `apps/web` does not exist
yet in your worktree, create the minimal folder structure for these paths
plus a self-contained test harness — do NOT scaffold the app (WS1a owns
that; merge order is WS1a → WS1b).

## 1. Share composition (`lib/share/composeCard.ts`)
- ONE renderer producing a **1200×630** canvas: left ~55% = skyline
  thumbnail (re-render from the block payload via a provided
  `drawSkylineThumb(ctx, payload, w, h)` callback parameter — WS1a's
  module supplies it at integration; for your tests, stub it with a
  deterministic placeholder), right = municipal receipt on --paper
  (#f4efe4): pedaterre wordmark (lowercase, Barlow Condensed 800), where
  line, dollars (largest element), rank line, quip (max 2 lines,
  ellipsis), stamp id `PD-{MN|BX|BK|QN|SI}-{block}-FY27`, source line
  "DOF assessed market value · not sale price · nyc.gov/finance".
- `Addressed lot`, never "Your lot", in the exported artifact. PARTIAL
  variant (no addressed lot) omits that row entirely. character='empty'
  variant: dollars row reads "assessed at $0".
- MUST `await document.fonts.ready` before drawing (test asserts the
  guard exists and resolves). No UI buttons in the export. Colors/typing
  from `lib/share/cardTokens.ts` (HANDOFF §4.1 values verbatim).
- Reference PNGs: render midtown-1398, median-si-245, centralpark-1111
  fixtures (stubbed thumb) → `apps/web/lib/share/__refs__/*.png`,
  committed via test bootstrap; test re-renders and pixel-compares
  (tolerance ≤ 1% differing pixels) so drift is caught.

## 2. Share actions (`lib/share/shareActions.ts`)
- `shareCard(payload)`: mobile-first — `navigator.share({files:[png]})`
  when available; else clipboard `ClipboardItem` write; else download
  fallback `pedaterre-{stamp}.png`. Detection order tested with mocked
  navigator. `copyLink(url)`: clipboard with `<input>` select fallback.
  All user-visible labels in the dry register: "Share card image",
  "Copy link", success toast "On the clipboard." — no emoji, no corny.

## 3. OG route (`app/api/og/[boro]/[block]/route.tsx`)
- Edge runtime, `@vercel/og` (ImageResponse) — the ONLY allowed
  dependency addition. **Data access: self-fetch the bucketed static
  JSON over HTTP** from the deployment origin
  (`{origin}/data/buckets/{boro}/{Math.floor(block/10)}.json` — origin
  from the request URL), pick the block, render a JSX mirror of the
  receipt side (skyline thumb as a simple bar silhouette derived from the
  top-12 group values — SVG rects, no canvas in edge runtime).
  `Cache-Control: public, immutable, max-age=31536000`. 404 → a generic
  pedaterre card. Unit-test the data-pick + silhouette logic (pure
  functions); the route handler itself can be exercised with a mocked
  fetch.

## 4. State system (`components/states/`)
Seven components per PLAN.md D-3, exact copy strings (dry municipal
register — they read like DOF notices, uppercase Barlow Condensed
labels): `LoadingState` (submitted address persists as header; static
low-detail silhouette block, no spinner; `aria-busy`; label
`PULLING THE ROLL…`), `EmptyState` (`NO NYC ADDRESS MATCH` + preserved
query + BBL entry link), `SearchErrorState` (`SEARCH UNAVAILABLE` +
retry + BBL entry), `BlockMissingState` (`NO PARCEL ON FILE — this block
is not in the FY2027 roll` + new search + demo links), `NetworkErrorState`
(context kept + inline `RETRY`), `PartialNotice` (persistent strip:
`THE REQUESTED LOT IS NOT ON THIS ROLL — showing the full block`; page
renders zero "YOU" claims), `DegradedState` (numeric card + accessible
table when canvas unavailable). Each: defined focus target (exported
`focusRef`), `role`/live-region per D-3, tokens only, min 44px targets.
Storybook NOT required — a `/states` dev page listing all seven is.

## Acceptance
`npm test` green in your scope (vitest or jest, self-contained);
reference-PNG comparisons pass; `/states` page renders all seven;
`grep -ri "block worth"` empty in your files; no AI attribution anywhere.
Commit nothing — leave the worktree dirty for review.
