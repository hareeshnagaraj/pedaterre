# SPEC — the $50M club register (`/club`)

`TASTE-BAR.md` is law; read it before writing copy or markup. The register
pattern already exists at `app/top/page.tsx` + `components/BlockRankList.tsx`
— study it and follow it rather than inventing a second table idiom.

Today the landing page states the club count (2,821) and defines the term,
but there is no way to see who is in it. This makes the most editorially
interesting set in the dataset browsable.

## 1. ETL — `index/club-lots.json`

Add a stage to `scripts/etl/build.py`. The club is defined by the sources
page as **raw tax lots above $50M, before condo grouping** — so these are
individual lots, not property groups. Do not use the group-level `club`
flag; select from the raw rows.

Per qualifying lot emit a compact record: `bbl` (10-digit), borough number,
block, lot, `mv` (dollars, integer), `owner` (repaired per the existing
`repair_owner` rule; omit when blank or `NAME NOT ON FILE`), `address`
(house number + street as filed), `bldgClass`, and `taxable` (reuse the
existing exempt-ratio rule at the lot level: exempt < half of assessed).
Sort descending by `mv`. Columnar or array-of-objects is your call; keep it
under ~500KB.

Tests: the row count equals the existing `clubLots` anchor (**2,821**) —
assert against the same constant `city-stats.json` reports, not a literal;
every record's `mv` exceeds 50,000,000; every `(boro, block)` exists in the
bucket tree; the sum of club `mv` divided by citywide total reproduces the
existing `clubShareOfMv` (0.2348) within rounding.

Extend `apps/web/scripts/sync-data.mjs` to publish the file.

## 2. `/club` — the page

Server shell + client list, mirroring `/top`:

- Heading states the count and the share from data, never literals — the
  club is 0.24% of lots carrying 23.5% of citywide assessed value, and both
  figures already exist in `city-stats.json`. That contrast is the reason
  the page exists; lead with it.
- Table columns: rank, borough · block · lot (linking to
  `/b/{boro}/{block}?lot={lot}`), address, owner as filed, assessed value.
  Value is the largest element in its row per PRIORITIZE 2.
- Borough filter chips reused from `/top`.
- A text filter over owner and address — this is the one people will
  actually use ("who owns X"). Debounced, case-insensitive substring.
- Chunked rendering at 200 rows with an IntersectionObserver sentinel, same
  as `BlockRankList`.
- `PUBLIC` tag on non-taxable lots, with the same wording discipline the
  register now uses: it marks exempt-dominated lots, and says exactly that.
- Owner strings are uncontrolled public input — render as text, never HTML.

Copy rules: no eyebrow unless it carries a figure or date (A1). No headline
of the form "noun phrase, past participle adverb" (A2). Do not describe the
page's own rigor (A3). State what the table is.

## 3. Wiring

- Add `Club` to `components/SiteNav.tsx` between Register and Map.
- On the landing page, the `Lots above $50M` figure in `.city-strip`
  becomes a link to `/club`.
- On a block page, if the block contains club lots, the existing gold
  treatment gains a link to `/club` filtered to that block.

## Acceptance
- `python3 -m unittest discover scripts/etl/tests` green including the new
  club tests.
- `cd apps/web && npm run build && npm test && npx playwright test` green.
- New Playwright spec: `/club` renders the first chunk, the borough filter
  narrows it, the text filter finds a known owner, a row links to the right
  block page, and the sentinel loads more on scroll.
- `grep -rn 'className="eyebrow"' apps/web --include="*.tsx"` still returns
  exactly 6 — do not add a seventh.
- No hard-coded club count, share, or roll year anywhere; all read from data.
- No AI attribution. No new dependencies.

Do not commit.
