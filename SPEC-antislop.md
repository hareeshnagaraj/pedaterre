# SPEC — apply the taste bar

`TASTE-BAR.md` at the repo root is law; read it first. Every change below
cites a clause. Findings come from a four-lens review panel; each has been
verified against source by the moderator. Do not re-litigate them — apply
them.

Work in `apps/web` unless a path says otherwise. Keep every existing test
green; update tests whose assertions encode a string you are changing.

---

## PART 1 — Correctness (do these first; two are live bugs)

**C1 · The citywide total renders as `$1911B`.** `lib/share/cardModel.ts:87`
`formatAssessedValue` has no trillions branch, so 1911446867962 formats as
`$1911B` — currently live on `/top`. Add a `>= 1e12` branch returning one
decimal, e.g. `$1.91T`. Add unit tests for 1e12 boundary, the real citywide
value, and that billions/millions behaviour is unchanged.
> PRIORITIZE 2 · The number is the hero.

**C2 · Fabricated data on the share image.**
`app/api/og/[boro]/[block]/route.tsx:56` falls back to
`[9, 5, 14, 7, 20, 11, 4, 8]` and draws it as the skyline — eight invented
magnitudes rendered in the product's own value-encoding language on its
most-screenshotted surface. Delete the fallback: no payload → no
silhouette, just the plate and the "not on file" notice.
> A9 · Unsourced figures. "A modelled or estimated figure is a violation
> regardless of how reasonable the model is."

**C3 · Barlow Condensed never loads in the CSS modules.** `--num` is a bare
font stack; the real family arrives via `--font-barlow` from
`next/font/google`, and there is no `@font-face` in the repo. `globals.css`
gets this right in 43 declarations. These 8 do not, and fall through to
Arial Narrow: `app/sources/sources.module.css:9,39,83`,
`components/siteNav.module.css:14`, `components/states/states.module.css:31,208,249,297`.
Change each to `font-family: var(--font-barlow), var(--num);`.
> A8 · Default typography.

**C4 · A quip asserts something the roll does not say.**
`scripts/etl/build.py:626` and `lib/share/cardModel.ts:178` both emit
`No towers here — {n} holdings within {x}× of each other. The roll calls
that balance.` But `character == "flat"` is derived from a **value ratio**
(`build.py:583`, `largest / total`), not from building heights — the record
supports no claim about towers, and "the roll calls that balance" is
editorial. Replace in BOTH files with:
`{n} holdings, all within {x}× of each other. No single filing dominates.`
Also drop `Everyone else is a row house in its shadow.`
(`build.py:608`, `cardModel.ts:171`) — keep the preceding sentence, which
is the real observation. Re-run `python3 scripts/etl/build.py` afterwards so
generated payloads match, and update the ETL quip tests.
> PRIORITIZE 3 · State a fact, not a feeling. PRIORITIZE 5 · Humor arrives
> only as an observation about a real number.

**C5 · `FY2027` / `FY27` hard-coded in six places** while `rollYear` lives
in `city-stats.json`: `app/page.tsx:22`, `app/game/page.tsx:20`,
`app/b/[boro]/[block]/page.tsx:103`, `app/api/og/[boro]/[block]/route.tsx:33`,
`lib/share/cardModel.ts:84` and `:197` (note `ShareCardPayload.rollYear` is
declared at `cardModel.ts:38` and never read), and
`components/states/BlockMissingState.tsx:31`. Thread the real value through
and delete the literals. `/top` and `/map` already do this correctly — copy
their approach.
> A9 · Unsourced figures.

**C6 · An internal enum is shown to users.** `components/BlockViz.tsx:109`
and `:1993` render `No assessed value · empty character`. `empty character`
is a schema enum (`lib/schema.ts`), not a municipal term. Replace with
`No assessed value on this roll`.
> PRIORITIZE 3 · State a fact.

---

## PART 2 — The eyebrow purge (A1)

21 eyebrows render, not the 14 a `className="eyebrow"` grep finds: seven
more come from the `eyebrow` prop on `components/states/StateFrame.tsx:36`.

**Keep these six** — each carries a date, borough, or roll identifier
absent from its heading, which A1 explicitly permits:
`app/page.tsx:22`, `app/game/page.tsx:20`, `app/top/page.tsx:36`,
`app/map/page.tsx:23`, `app/b/[boro]/[block]/page.tsx:93`,
`components/FixtureView.tsx:38`. (The first two must use the real
`rollYear` per C5.)

**Delete these fifteen.** Each restates or categorizes its own heading:

| file:line | eyebrow |
|---|---|
| `app/sources/page.tsx:123` | `SOURCES & VERIFICATION` |
| `app/page.tsx:73` | `SOURCES & VERIFICATION` |
| `app/page.tsx:36` | `FROM THE LIVE ROLL` |
| `app/top/page.tsx:64` | `THE GHOST CITY` |
| `components/CityMap.tsx:719` | `KEYBOARD REGISTER` |
| `components/SharePanel.tsx:97` | `SHARE CARD` |
| `components/AssessorsGame.tsx:524` | `RUN CLOSED` |
| `app/not-found.tsx:6` | `fixture notice` |
| `components/states/EmptyState.tsx:23` | `SEARCH NOTICE` |
| `components/states/SearchErrorState.tsx:33` | `SEARCH NOTICE` |
| `components/states/NetworkErrorState.tsx:23` | `CONNECTION NOTICE` |
| `components/states/BlockMissingState.tsx:30` | `ROLL NOTICE` |
| `components/states/DegradedState.tsx:42` | `DISPLAY NOTICE` |
| `components/states/LoadingState.tsx:37` | `ASSESSMENT REQUEST` |
| `components/AssessorsGame.tsx:151` | `ASSESSMENT EXERCISE` |

Make `eyebrow` **optional** on `StateFrame` and stop passing it at all
seven state call sites — that clears the last seven rows in one change.

> A1 · The eyebrow. "A line above a headline is permitted only when it
> carries information absent from the headline — a figure, a date, a count.
> `SOURCES & VERIFICATION` above a sources heading is a violation."

---

## PART 3 — Copy (A2, A3, PRIORITIZE 3)

Rewrite each. Dry municipal register; state a fact, never describe the
writing.

| file:line | from | to |
|---|---|---|
| `app/page.tsx:74`, `app/sources/page.tsx:124` | `Filed values, named plainly.` | `Every number here is a sum of filed values.` |
| `app/page.tsx:118` | `Every figure, defined and sourced.` | `Every figure and where it was filed.` |
| `app/page.tsx:106` | `Every block, ranked as filed.` | `All 28,798 blocks by assessed value.` (read the count from stats) |
| `app/page.tsx:110` | `The city drawn from its own roll.` | `Located blocks plotted at their PLUTO centroids.` |
| `app/page.tsx:31` | `…or Zestimate.` | `…or a market estimate.` |
| `app/sources/page.tsx:126–129` | `Nothing is estimated, modelled, or inferred. Where a figure required a decision on our part, that decision is written down here.` | delete both sentences; the 11-row table below is the proof |
| `app/sources/page.tsx:112` | `This is the filed roll, not an argument about it. Assessments are appealed…` | drop the first clause; begin at `Assessments are appealed…` |
| `components/AssessorsGame.tsx:524–525` | `RUN CLOSED` / `THE ROLL HAS BEEN ENTERED.` | delete the eyebrow; heading becomes `RUN CLOSED AT {streak}.` |
| `components/AssessorsGame.tsx:439–441` | the instruction paragraph | delete — `app/game/page.tsx:23` already says it on the same screen |

Also: `SharePanel.tsx:71` `setNotice(result.message ?? "Link copied.")` —
the fallback is unreachable because `clipboardSuccess` is always set. Delete
the dead string.

> A2 · "The thing I did, done adverb." A3 · Self-describing copy.
> PRIORITIZE 1 · Every element carries information.

---

## PART 4 — Structure and density

**S1 · The landing card row.** `app/page.tsx:103–120` renders four equal
bordered cards (label + one-line description) pointing at exactly the four
destinations already in `SiteNav`. Replace with a plain list of four links,
each carrying a real count from `stats` — `Register · 28,798 blocks`,
`Map · 28,787 located`, and so on. Delete the now-unused `.landing-footer`
card rules in `globals.css:369–403`.
> A4 · Symmetrical feature triads.

**S2 · The fake skyline.** `components/states/states.module.css` `.silhouette`
(210px) with six hard-coded tower heights, rendered at
`components/states/LoadingState.tsx:47` and `components/AssessorsGame.tsx:161`.
In this product, tower height *is* the encoding for assessed value; this
speaks that language while carrying no data, on the first screen a visitor
sees. Delete the element, its CSS, and both render sites. The honest content
(`ADDRESS ON FILE {query}`, `PULLING THE ROLL…`) already carries the state.
> PRIORITIZE 1 · Every element carries information.

**S3 · The number is not the hero on a block page.**
`globals.css:1138` `.headline-stats dd` is `1.8rem` while
`globals.css:1100` `.block-heading h1` is up to `5.6rem` — the block's
*identifier* renders 3.1× larger than its *value*. Give the assessed-value
`dd` the `.share-dollars` treatment (`clamp(3.5rem, 8vw, 6.5rem)`,
`line-height: 0.8`) and demote the `h1` to about `2rem`.
> PRIORITIZE 2 · The number is the hero.

**S4 · Landing has no figure for ~1,020px.** Drop `.landing-hero`
min-height, cut its vertical padding roughly in half, and move `.city-strip`
above `.featured-blocks`. Add the citywide total as the first and largest
cell in `.city-strip` — `stats.totalMv` is already awaited and currently
unused on that page.
> PRIORITIZE 4 · Density over breathing room.

**S5 · `/top` buries its own register.** The page promises
"ALL 28,798 BLOCKS, RANKED"; the first row appears ~1,280px down, behind the
ghost-capacity section. Move `.ghost-citywide` **below** `<BlockRankList />`.
> PRIORITIZE 4 · Density over breathing room.

**S6 · Featured blocks hide the figure they were chosen by.**
`app/page.tsx:39–51` shows only address and block number; the source
records carry `totalM` and `owner`. Render the value as the dominant
element with owner-as-filed beneath.
> PRIORITIZE 1 · Every element carries information.

**S7 · Ornament on the sources page.**
`app/sources/sources.module.css:76` gives all five caveats an identical
stamp-red left border, so it distinguishes nothing; and `.page h3`
`margin: 44px 0 14px` wastes ~176px on the densest page in the product.
Drop the border for a hairline rule between items; reduce the h3 margin to
about 20px.
> A6 · Ornament. PRIORITIZE 1.

**S8 · The hatched empty-block mark.** `globals.css:1460` and
`:1436` — a 94×66 dashed hatch box in a centered layout, rendered at
`components/BlockViz.tsx:135` and `:2373`. Delete it and range the copy
left, matching every other body block on the site.
> A6 · Ornament ("centered-everything layouts"). PRIORITIZE 1.

---

## Acceptance
- `python3 -m unittest discover scripts/etl/tests` green (quip tests updated).
- `cd apps/web && npm run build && npm test && npx playwright test` all green.
- `grep -rn 'className="eyebrow"' apps/web` returns exactly 6 — and the
  `StateFrame` eyebrow prop is gone from all seven state call sites.
- `grep -rn "var(--num)" --include="*.module.css" apps/web | grep -v font-barlow`
  returns nothing.
- `grep -rn "FY2027\|FY27" apps/web --include="*.tsx" --include="*.ts"`
  returns nothing outside comments.
- `formatAssessedValue(1911446867962)` returns a `T`-suffixed string.
- No AI attribution anywhere; no new dependencies.

Do not commit — leave the worktree dirty for review.
