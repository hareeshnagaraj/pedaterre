<!-- /autoplan restore point: /Users/hareeshnagaraj/.gstack/projects/pedaterre/main-autoplan-restore-20260727-113448.md -->
# pedaterre — execution plan (2026-07-27)

Ship plan for turning `design/block-worth-mock.html` into the deployed product,
today. Product decisions are locked in `HANDOFF.md` — this plan only decides
**who does what, in what order, and how we verify it**. Nothing here re-opens
scope.

## Verified preconditions (checked live before writing this)

| Check | Result |
|-------|--------|
| codex CLI | `codex-cli 0.145.0` installed — all implementation dispatches there |
| Node / Python | v23.11.0 / 3.14.4 |
| NYC Open Data `8y4t-faws` | **Live, FY2027 roll**, extract date 2026-01-08 |
| Real columns confirmed | `boro`, `block`, `lot`, `parid` (BBL), `curmkttot`, `finmkttot`, `owner`, `bldg_class`, `units`, `year`, `extracrdt` |

Key ETL decision (revised in Round 1 with empirical verification): the dataset
carries BOTH the tentative (period=1) and **final (period=3)** FY27 rolls.
The extract filters `period=3 AND rectype=1` at download time; value column is
`curmkttot` on final-roll rows, cross-checked against `finmkttot` during ETL
(both columns downloaded). Footer says "FY2027 final roll" — verified, not
assumed. ETL verifies 3 known BBLs against the Property Information Portal
plus stratified borough/tax-class reconciliation (see Round 1 amendments).

Second probe (group-by-year count): the dataset holds **five roll years
(2023–2027)**; FY2027 alone is **2,358,927 rows** — roughly 2× the city's
~1.1M lots, because the roll carries multiple record types / assessment
periods per parcel. Consequences, now baked into the plan:

- Download filters `$where=year='2027'` and pages by `$order=:id`
  (unique system column — `parid` is NOT unique, so ordering by it could
  skip/duplicate rows across pages).
- ETL must **dedupe to one row per parid** (latest period / correct rectype),
  and the dedupe rule is a documented, tested decision — the lot count after
  dedupe should land near the known ~1.09M NYC tax lots, and that sanity
  bound is a unit test, not a hope.
- Column-trimmed pull is ~250MB for 2.36M rows — still a background job,
  not the schedule's long pole. Script: `scripts/etl/download.sh`.

## Division of labor

Fable session (this one): specs, diff review, visual validation against the
mock, git operations, deploy, QA. codex (`codex exec` in isolated worktrees):
every line of implementation code. Two dispatches run in parallel; neither
blocks the other.

## Timeline (start ≈ 11:30, ship target ≈ 19:00–20:00)

```
T+0     Kick data download (background)          ← FIRST ACTION, before any code
T+0     Write SPEC-viz.md + SPEC-etl.md          (Fable, ~45 min, parallel w/ download)
T+1h    Dispatch WS1 (scaffold + viz port)        codex worktree A   ~3–4h
T+1h    Dispatch WS2 (ETL)                        codex worktree B   ~2–3h
T+1h→   Visual validation loop on WS1 via /browse (Fable, iterative)
T+4h    WS2 lands → review, merge; run ETL over full extract
T+4.5h  Dispatch WS3 (GeoSearch address → BBL)    codex, small, ~1h
T+5.5h  Integrate: real block payloads into viz; DEMO→LIVE badges
T+6h    deploy-preflight skill; Vercel project `pedaterre`; deploy
T+6.5h  Full QA pass (desktop Chrome + mobile Safari via /browse); fix round
T+7.5h  Launch kit (below). Done.
```

## Step 0 — data download (DONE — ran during Round 1 review)

`scripts/etl/download.sh`: paged SODA CSV pull, ordered by unique `:id`
(never `parid` — non-unique), 500k rows/page, filtered to
`year=2027 AND period=3 AND rectype=1` (the final roll), columns including
`coop_num` (condo grouping), `finmkttot` (cross-check), and address fields.
~1.18M rows across 3 pages. `sha256`, `source_url`, `ingested_at` →
`data/raw/meta.json`. Snapshot-consistency risk of offset paging accepted
because the final roll is a static publication; ingest verifies total row
count against a live SODA `count(*)` for the same filter — mismatch fails
the build. DOF bulk zip remains the fallback source only.

## WS1 — scaffold + viz port (codex, worktree A) — Phases A+B as one unit

One owner for one coherent unit: app shell and viz port split badly at an
arbitrary seam, so they ship as a single dispatch.

Spec (`SPEC-viz.md`) will carry, at minimum:

- Next.js App Router + TS in `apps/web`; tokens verbatim from HANDOFF §4.1;
  Libre Franklin + Barlow Condensed via `next/font`.
- Port — do not rewrite — the mock's canvas modules: `project()`, `hScale()`,
  `recomputeFit()` 8-corner AABB fit (pad 0.76, optical bias `h*0.54`),
  squarified treemap (`squarify`/`worstAspect`/`layoutRow`), whale-slab
  hierarchical carve, `thermalRGB` ramp, hit testing, label collision. The
  spec names the mock's line ranges for each.
- Chrome structure fixed per HANDOFF §7.3: tabs outside canvas, HTML legend
  below, HUD only in skyline mode. Listed as acceptance criteria, not advice.
- Fixtures: midtown + brooklyn payloads extracted from the mock into
  `data/fixtures/`, rendering visually identical to the mock.
- Share card with copy-link + copy-image; `PD-` stamp prefix; zero
  "Block Worth" strings (`grep -ri "block worth" apps/` must return nothing).
- Acceptance command: `npm run build && npm run test` green, plus a
  screenshot script for the two fixtures that Fable judges against the mock.

Validation loop (Fable): run dev server, `/browse` both fixtures side-by-side
with the mock, write concrete deltas (framing, label collisions, ramp, type),
re-dispatch until parity. Two failed corrective rounds on any module → that
module gets written here (arbitrage escape hatch).

## WS2 — ETL (codex, worktree B) — Phase C, parallel with WS1

Spec (`SPEC-etl.md`) will carry:

- Node + duckdb (single runtime with the app; Polars fallback noted).
- Input: `data/raw/*.csv`. Normalize: BBL from `parid`/boro+block+lot,
  `mv = curmkttot`, owner exact string, entity regex per HANDOFF §5.3 with
  word boundaries.
- Outputs: `data/generated/blocks/{borough}/{block}.json` (BlockPayload
  schema, HANDOFF §6.2, synthetic near-square `(c,r)` grid by lot order),
  `index/city-stats.json`, `index/block-ranks.json`, `meta.json` with roll
  year, extract sha, row count.
- Size guard: values rounded, owners trimmed; target full tree of ~13–14k
  block files. Each block fetch is tiny; if the total tree exceeds Vercel
  comfort (~1GB), fall back to Vercel Blob for block files — decision point
  logged, not silently taken.
- Acceptance: unit tests recomputing the $50M club two independent ways
  (duckdb SQL vs. streamed JS reduce) with exact match; 3 known BBLs
  spot-checked against PIP values (listed in the spec); `npm run etl`
  end-to-end on the real extract.

## WS3 — address → block (codex, small dispatch after WS1 merges) — Phase D

GeoSearch proxy route, autocomplete on landing, BBL parse → block payload →
`you` lot flag, deep link `/b/[borough]/[block]?lot=`, four error states
(not found / lot missing / block not ingested / GeoSearch down → BBL direct
entry). Acceptance: 5 real addresses across MN/BK resolve to LIVE blocks.

## Integration, honesty, deploy (Fable) — Phase E

- Review + merge each worktree diff here; commits imperative, no attribution
  trailers (HANDOFF §13 — also enforced by acceptance grep of git log).
- DEMO badge only on fixtures; LIVE badge + footer
  (`DOF FY2027 · extract <shorthash> · market value (assessment)`) wired to
  `meta.json` — never hard-coded.
- PIP deep links per lot.
- Run `deploy-preflight` (mandatory), then Vercel project **pedaterre**
  (new project — not the `design` lab project).

## Viral pass + launch kit (Fable) — Phase F

Honesty note: nothing *guarantees* virality by morning. What we control:
a screenshot-worthy share card, a working share link on mobile, topical
framing (the July DOF-dump discourse), and posting assets ready tonight.

- Mobile QA via `/browse` mobile viewport: card stacks, canvas usable,
  tabs tappable, share-card copy-image works on mobile Safari.
- Meta: `pedaterre — NYC tax block assessed value`, utilitarian description.
- Launch kit deliverable (in `launch/`, not deployed): 3 tweet-length posts
  in the product's dry register, each anchored on one real computed number
  (e.g. actual citywide $50M-club share from the ETL — never invented), plus
  share-card PNGs for 2–3 photogenic real blocks (a midtown whale block, a
  quiet outer-borough block, and whatever the ETL reveals as the #1 block
  citywide — that one is the likely headline post).
- Optional adversarial pass if time remains: `/spar` the launch copy and a
  fresh-eyes product QA once the public URL is live.

## Ship gate

HANDOFF §11's 13 criteria, checked one by one against the deployed URL, plus:
deploy-preflight green, `grep -ri "block worth"` empty in app UI, git log
clean of attribution, and the $50M-club number on the landing page traced
to `city-stats.json` (not a literal in the source).

## Risk table

| Risk | Mitigation |
|------|-----------|
| SODA throttling / slow pages | Started at T+0; DOF bulk zip fallback; WS1 doesn't depend on it |
| Viz port loses mock craft | Line-range-level spec + Fable visual loop + escape hatch after 2 rounds |
| `curmkttot` wrong for some tax classes | 3-BBL PIP spot-check is a hard acceptance gate, not a nice-to-have |
| Static tree too big for Vercel | Vercel Blob fallback, decided at integration with real numbers |
| GeoSearch CORS/downtime | Proxy route + BBL direct entry + demo buttons remain |
| codex struggles on canvas math | Spec carries the mock's own code as reference; port, not reinvent |

---

# Review Round 1 — /autoplan (CEO phase)

## Step 0A — Premise challenge

| # | Premise | Verdict |
|---|---------|---------|
| P1 | Product locks (name, value definition, non-goals) per HANDOFF §1 | USER-LOCKED — not re-litigated; handoff explicitly forbids re-ideation |
| P2 | Ship today is feasible | HOLDS — data already downloaded (100s), mock is 90% of frontend thinking, codex quota available |
| P3 | "Viral by tomorrow" is guaranteed | FALSE AS STATED — plan already says so honestly; we control share card, real numbers, launch assets, timing |
| P4 | `curmkttot` is the right value column | REVISED — dataset contains tentative (period 1) AND final (period 3) FY27 rolls; authoritative = period 3 rows. Verified live against block 1398 |
| P5 | One dataset covers all lots | HOLDS — 8y4t-faws has tax classes 1–4; rectype 1 = real property (2.33M rows), rectype 3 (24,790) excluded |
| P6 | ~13–14k static block JSONs feasible on Vercel | HOLDS provisionally — measured after ETL; Blob fallback pre-decided |
| P7 | GeoSearch is free/keyless | ASSUMED — verified at WS3 dispatch; BBL direct entry is the fallback |
| P8 | Lane is open (nobody built this yet) | CHECKED — web search finds only lookup utilities (PIP, PropertyShark), no viral viz product on the July DOF-dump discourse |

## Step 0B — Existing leverage
- `design/block-worth-mock.html`: all viz algorithms, share card, sources section → **ported, not rebuilt** (the plan's core reuse bet).
- `scripts/etl/download.sh` + `data/raw/`: extract already local.
- `design/.vercel`: prior project — deliberately NOT reused for prod.
- Nothing in the plan rebuilds something that exists. No DRY violations at plan level.

## Step 0C — Dream state
```
CURRENT                      THIS PLAN                       12-MONTH IDEAL
polished mock,       --->    deployed product, final FY27    ---> multi-year rolls, real GIS
fake data, no app            roll, search, share loop             footprints, owner networks,
                                                                  Turso queries (HANDOFF §14)
```
BlockPayload schema is the contract that makes the static→Turso migration additive, not a rewrite. Plan moves toward the ideal.

## Step 0C-bis — Implementation alternatives
```
A: Static precompute + Next.js (plan's choice)   Effort M  Risk Low   Completeness 9/10
   Reuses mock algorithms + handoff's own "ponytail default". Ship-today compatible.
B: Turso/libsql live queries day-1               Effort L  Risk Med   Completeness 9/10
   Better ad-hoc queries later; new infra on a same-day deadline; violates HANDOFF §1 datastore lock for day-1.
C: Pure static SPA (Vite), no API routes         Effort S  Risk Low   Completeness 7/10
   Geocode proxy still needs a serverless function somewhere; Next.js gives both for free.
```
**DECISION (auto, mechanical):** A — it is the handoff's own prescribed default (user already chose); P1+P5 concur. Not surfaced at gate.

## Step 0D — Selective-expansion scan
Baseline scope held. Candidates surfaced (decided at final gate, not silently included):
1. **OG share images** (@vercel/og per-block card) — links unfurl with the card on X/iMessage; arguably the single biggest virality lever. HANDOFF §10-F calls it "optional, later — not a blocker." → **TASTE DECISION at gate** (models may push to include; user's handoff defers it).
2. **Citywide leaderboard page** (`/top` — top-10 most valuable blocks) — data already computed by ETL rank job; small page; gives the launch posts a destination ("#1 block in NYC"). Not mentioned in HANDOFF; not excluded by non-goals. → **TASTE DECISION at gate**.
3. Rejected without gate (P3/P4): borough stats strip (duplicates inequality strip), quip LLM generation (HANDOFF §14 defers), historical deltas (needs multi-year ingest).

## Step 0E — Temporal interrogation (execution-hour ambiguities resolved NOW)
- **HOUR 1:** worktree + spec files. Mock line-range map (mock-mapper agent) feeds SPEC-viz.
- **HOUR 2–3 (the ones that would have burned the day):**
  - *Period dedupe:* filter `period=3, rectype=1` — else every lot counts twice. Re-download running with that filter baked in.
  - *Condo explosion:* block 1398 = ~252 real lots (each condo apartment is a tax lot). **ETL must aggregate condo unit lots into buildings via `coop_num`** (column added to re-download); viz renders buildings, lot detail lists units. Whale-share + $50M-club semantics defined on the aggregated building, with the raw-lot definition preserved for city stats (club = lots per HANDOFF §5.2 — both numbers computed, UI labels which).
  - *CSV integrity:* 86 rows have embedded newlines in owner strings — duckdb/real parser mandatory, line tools forbidden in ETL.
- **HOUR 4–5:** Vercel upload of ~14k files — measure; Blob fallback pre-authorized. html2canvas vs native canvas export for card image — spec picks ONE (native canvas redraw of card; html2canvas only if card stays DOM).
- **HOUR 6+:** mobile Safari clipboard-image limits (fallback: long-press/save PNG), reduced-motion paths, OG decision.

## Step 0F — Mode
SELECTIVE EXPANSION (autoplan-forced). Approach A confirmed. Committed.

## Sections 1–11 (full pass; auto-decided findings logged in audit trail)

### 1. Architecture
```
NYC Open Data (SODA) ──curl──> data/raw/*.csv ──duckdb ETL──> data/generated/
                                                    │   blocks/{boro}/{block}.json
                                                    │   index/city-stats.json
                                                    └── meta.json (roll yr, sha, counts)
GeoSearch API <──proxy── /api/geocode <── Landing search
blocks JSON  <──fetch──  /b/[boro]/[block] page ──> BlockViz canvas (skyline|thermal)
                                                └─> ShareCard (canvas export)
```
- Shadow paths per flow mapped in §4 below. SPOF: GeoSearch (mitigated: BBL entry + demo buttons + proxy timeout → error state).
- Scaling: static files + CDN — 10x/100x load is Vercel's problem, not ours. No DB.
- Rollback: `vercel rollback` to previous deployment; no migrations exist. Minutes.
- Coupling: viz modules take `BlockPayload` only — no data-layer coupling. **OK.**

### 2. Error & rescue map
```
CODEPATH                 | FAILURE                        | RESCUE                          | USER SEES
etl ingest               | malformed row (newline owner)  | real CSV parser; count+log rows | n/a (build-time, fails loudly)
etl ingest               | NaN/negative mv                | coerce+log; exclude with count  | n/a; count in meta.json
etl aggregate            | empty block after filters      | omit file; API 404 path         | "block not in this roll" state
/api/geocode             | GeoSearch timeout/5xx          | 5s timeout, 1 retry             | "search unavailable — try BBL"
/api/geocode             | zero matches                   | 200 + empty list                | "no NYC address match" + BBL link
block fetch (client)     | 404 (not ingested)             | typed error state               | "not in FY27 roll" + demo links
block fetch (client)     | network fail / abort           | AbortController on nav; retry   | inline retry button
canvas init              | 2d ctx unavailable             | feature-detect                  | static fallback card + numbers
copy share link          | clipboard API denied           | fallback <input> select+copy    | copied toast either way
copy card image          | iOS Safari canvas.toBlob quirks| download-link fallback          | "saved image" path
```
Zero silent failures: every ETL exclusion is counted in meta.json; every client error has a named state. **GAPS found and fixed in plan:** clipboard fallback, 404-vs-network distinction (were unspecified).

### 3. Security & threat model
- Attack surface: 1 proxy route + static files. Proxy pinned to GeoSearch host, query param URL-encoded, no header passthrough — no SSRF surface. Edge-cache proxy responses (60s) to blunt abuse. (L/M)
- XSS: `owner` strings are uncontrolled public input rendered in UI — React escapes by default; **rule: never `dangerouslySetInnerHTML` for data fields**; canvas text is inert. (M/H → mitigated)
- Deep-link params validated: borough ∈ 1–5, block ∈ 1–99999, lot numeric; else 404 state. (L/M)
- No auth, no PII beyond public record, no secrets client-side. Dependencies: prefer zero new heavy deps (native canvas export over html2canvas). **OK with the two rules above.**

### 4. Data flow & interaction edge cases
- Search: double-submit (disable while in-flight), navigate-away (abort), slow network (skeleton + timeout state), paste of a BBL into address box (detect `d-ddddd` pattern → direct).
- Block view: 1-lot block (whale share = 100% — copy must not be silly), 0-value lots (height floor 1px + excluded from ramp extremes), 400-lot pre-aggregation block (aggregation caps it; hard cap: if >120 buildings post-aggregation, group tail into "other lots" district — thermal already has hierarchical carve), stale share link to re-ingested roll (payload carries rollYear; UI shows it).
- Share: copy during canvas animation (export from final-state offscreen redraw, not mid-animation framebuffer).

### 5. Code quality
- Port-don't-rewrite is the load-bearing rule (HANDOFF §7) — plan already encodes it; spec adds line-range references so codex ports faithfully.
- TS modules: `BlockViz` (mode switch), `skyline.ts`, `thermal.ts`, `treemap.ts` (squarify pure functions — unit-testable), `share.ts`. Pure layout functions separated from canvas draw = testable without DOM. **Added to SPEC-viz.**
- No chart libraries. No new abstractions beyond the payload contract.

### 6. Test review
```
NEW CODEPATHS → TESTS
etl period filter + dedupe      → unit: row counts per period; post-dedupe ≈ 1.18M ± sanity band
etl condo aggregation           → unit: block 1398 → buildings ≈ dozens not 252; sum preserved exactly
etl $50M club                   → unit: two independent recomputes (SQL vs streamed reduce) match exactly
etl known-BBL spot checks       → unit: 3 BBLs vs raw CSV values (listed in SPEC-etl)
squarify/worstAspect            → unit: areas sum to container; aspect bound holds
whale carve trigger             → unit: ≥40% share → hierarchical layout
share stamp id                  → unit: PD-MN-1398-FY27 format
geocode proxy                   → integration: mock GeoSearch 200/timeout/empty
fixtures render                 → screenshot script (2 fixtures) judged vs mock by this session
```
2am-Friday test: the two-way club recompute + condo-sum-preservation — if those hold, the headline numbers are right. Chaos: run ETL twice → byte-identical output (determinism check). Flakiness: no time/random deps in tests; screenshot compare is human-judged, not pixel-asserted. **Test plan artifact:** `~/.gstack/projects/pedaterre/main-test-plan-*.md` (written at Eng phase).

### 7. Performance
- Skyline with ~dozens of buildings: fine (mock proves it). Post-aggregation cap (§4) bounds worst case.
- Payload size: mega condo blocks shrink via aggregation; target <150KB/block JSON; `Cache-Control: immutable` + hashed paths not needed day-1 (rolls change yearly).
- city-stats.json tiny; ranks embedded in each BlockPayload (schema already does this) — no client-side 14k-row rank lookup. **OK.**

### 8. Observability (right-sized for a static day-1 product)
- meta.json surfaces ingest counts/hash in footer — data drift is user-visible by design.
- Vercel default logs for the proxy route; client errors console-tagged `[pedaterre]`.
- Deliberately NOT building dashboards/alerting day-1 (P3 pragmatism; static site). Deferred to TODOS with the Turso migration.

### 9. Deployment
- No migrations, no flags, atomic static deploys, `vercel rollback` = full rollback story.
- deploy-preflight (clean-clone build + env audit) mandatory before first deploy. Post-deploy smoke: landing, 1 demo, 1 real block, share copy, `#sources`, mobile viewport — scripted via /browse.
- Risk window: none (no old/new code coexistence).

### 10. Long-term trajectory
- Reversibility 4/5 (static artifacts, schema contract; only the aggregated-vs-raw club semantics is a public-number commitment — documented in sources section).
- Debt logged: synthetic grid (documented as schematic), condo aggregation heuristic (labeled "as filed / grouped by condo number"), no dashboards. All in TODOS.
- 1-year read: HANDOFF + PLAN + SOURCES give a new engineer the full why. **OK.**

### 11. Design & UX (CEO-level; Phase 2 goes deeper)
- State coverage: LOADING (skeleton) / EMPTY (no match) / ERROR (three typed states) / SUCCESS / PARTIAL (block found, lot missing → block view w/o YOU pin) — all now named.
- Emotional arc: type address → "whoa, skyline of money" → find YOU → indignant/amused at whale share → screenshot → share. The arc depends on <4s to first skyline paint on mobile — perf budget added to SPEC-viz.
- AI-slop risk: mock already fought this war (HANDOFF §12); restraint rules are requirements.
- Accessibility: tabs keyboard-navigable, canvas has text alternative (lot table in DOM for SR), contrast tokens pass on void bg, touch targets ≥44px, `prefers-reduced-motion` per handoff.

## Required outputs
**NOT in scope (unchanged + additions):** HANDOFF §14 list; borough strip; quip generation; dashboards/alerting; real footprints; multi-year.
**What already exists:** mock (viz+card+sources), download script + extract, fixtures-to-be (extracted from mock), Vercel account/CLI.
**Dream state delta:** ships the product loop end-to-end on real final-roll data; leaves GIS/history/query-flexibility on the deferred list where the handoff put them.
**Failure modes registry:** §2 table; zero rows with RESCUED=N remaining in plan. No CRITICAL GAPs open.
**TODOS:** captured in §Deferred + tasks JSONL (T1–T5 written to gstack).

## Decision Audit Trail

| # | Phase | Decision | Class | Principle | Rationale | Rejected |
|---|-------|----------|-------|-----------|-----------|----------|
| 1 | CEO | Skip /office-hours prerequisite | Mechanical | P6 | HANDOFF forbids re-ideation; it IS the design doc | office-hours run |
| 2 | CEO | Skip DX review phase | Mechanical | P3 | Consumer product; dev-facing surface = README, covered by Eng | DX phase |
| 3 | CEO | Approach A (static precompute + Next.js) | Mechanical | P1,P5 | Handoff's own prescribed default | Turso day-1; Vite SPA |
| 4 | CEO | ETL filters period=3 rectype=1 | Mechanical | P1 | Final roll is authoritative; tentative double-counts | use-all-rows |
| 5 | CEO | Condo aggregation via coop_num, sum-preserving | Mechanical | P1 | 252-lot blocks unrenderable; totals must be exact | lot-cap truncation |
| 6 | CEO | Re-download w/ coop_num+address cols, final only | Mechanical | P3 | 60s cost; unblocks T2 and addressHint | derive from old extract |
| 7 | CEO | duckdb parser; line tools banned in ETL | Mechanical | P5 | 86 embedded-newline rows corrupt line-based parsing | awk pipeline |
| 8 | CEO | Native canvas export for card (no html2canvas) | Mechanical | P5 | Fewer deps, mobile Safari friendlier | html2canvas |
| 9 | CEO | OG share images: include? | **TASTE** | — | Biggest unfurl lever vs HANDOFF's "optional later" | → gate |
| 10 | CEO | /top leaderboard page: include? | **TASTE** | — | Launch-post destination vs scope discipline | → gate |
| 11 | CEO | Observability deferred to Turso migration | Mechanical | P3 | Static site; meta.json footer is the day-1 signal | dashboards now |
| 12 | CEO | Foundations-first: Fable builds scaffold+schema+golden payload BEFORE dispatch | Mechanical | P5 | codex voice: parallel workstreams collide at foundations without a shared contract | dispatch-first |
| 13 | CEO | Delivery gate pre-dispatch: extrapolate artifact size, pick static-vs-Blob NOW | Mechanical | P6 | codex voice: serving-path change at T+5.5 is expensive; at T+1 it's config | decide-at-integration |
| 14 | CEO | Timeline = hard gates, preview-QA-then-promote (not prod-then-QA) | Mechanical | P1 | codex voice: QA after prod deploy is backwards; Vercel preview → promote is free | hour-estimates |
| 15 | CEO | Full-city coverage is the cut line; 10-address matrix across all 5 boroughs | Mechanical | P1 | codex voice: partial coverage hidden behind an error state breaks the core promise | MN/BK-only tests |
| 16 | CEO | Launch numbers manually verified; exempt/govt whales (e.g. Governors Island $357M, class Y4) flagged in editorial picks | Mechanical | P1 | codex voice: auto-picking "#1 block" risks headlining a government parcel artifact | auto-pick |
| 17 | CEO | Real-iPhone Safari check by user before launch posts (harness /browse ≠ Safari evidence) | Mechanical | P1 | codex voice: mobile Safari is a locked ship criterion; headless Chromium can't prove it | viewport-only QA |
| 18 | CEO | GeoSearch proxy: q≤120 chars, 5s timeout, 60s edge cache, pinned host | Mechanical | P1 | codex voice: public proxy needs bounds | unbounded proxy |
| 19 | CEO | Keep SODA extract as primary source (reject bulk-zip-primary) | Mechanical | P3 | sha + live count(*) match + stratified reconciliation = sufficient integrity; zip costs hours | DOF zip primary |
| 20 | CEO | Next.js verbatim-port vs productionize-mock-directly | **CHALLENGE → USER DECIDED** | — | User confirmed Next.js verbatim port at premise gate (D2); codex's regression concern absorbed via verbatim mandate + parity gate G3 | mock-as-app |

**Premise gate (D1): PASSED** — user confirmed all 8 premises as revised, 2026-07-27.

| # | Phase | Decision | Class | Principle | Rationale | Rejected |
|---|-------|----------|-------|-----------|-----------|----------|
| 21 | CEO | Aggregate-first re-sequencing; headline numbers locked in-session | Mechanical | P6 | Data was never the long pole (download 90s, aggregate 5s); unknowns retired pre-dispatch | T+4h discovery |
| 22 | CEO | Launch kit decoupled from build, cut from locked numbers | Mechanical | P6 | Timing bet must not depend on the deploy landing | T+7.5h serial tail |
| 23 | CEO | ETL runtime = Python stdlib csv + Node streaming cross-check | Mechanical | P5 | duckdb/Polars not installed; stdlib measured at 5s; two genuinely different recompute paths | duckdb |
| 24 | CEO | GeoSearch v2 pinned, BBL path verbatim in spec | Mechanical | P1 | v1 is HTTP 410; model priors would write dead code | unpinned |
| 25 | CEO | Exact-count sanity tests (1,167,962 / 28,799) | Mechanical | P1 | "~1.09M" bound would fail-then-loosen | fuzzy bound |
| 26 | Design | Block character system + median-block third fixture | Mechanical | P1 | 94.4% of blocks have no club lot; fixtures were p97–99 | fixture-only parity |
| 27 | Design | Condo rule final: drop only zero-value R0; group ≥1001 by address; lot→group map in payload | Mechanical | P1 | $6.7B of value-bearing high lots must not drop; every condo dweller hits PARTIAL otherwise | range-based drop |
| 28 | Design | Card image spec'd as new work (mock stub); fonts.ready gate; reference PNG | Mechanical | P1 | "Copy image" in mock is flash("mock") — nothing to port | port-assumption |
| 29 | Design | rankAll + rankTaxable dual universes; /top + launch = taxable, labeled | Mechanical | P1 | Naive #1 = JFK/Central Park; correction-bait | single universe |
| 30 | Design | Idle-orbit budget (20s + IntersectionObserver), CSS_H parameterized, touch-action pan-y | Mechanical | P5 | Battery + scroll-trap + postage-stamp fit on phones | verbatim 440px |

## Round 1 amendments (absorbed from codex CEO voice)

1. **Foundations-first (pre-dispatch, Fable-owned):** root scaffold, `apps/web`
   skeleton, `BlockPayload` runtime schema (zod) with units FIXED (`v` =
   millions, `totalMv` = dollars), one **golden payload** generated from real
   block data, contract test consumed by both WS1 and WS2, explicit file
   ownership map (WS1: `apps/web/**` except `lib/schema`; WS2:
   `scripts/etl/**`; schema owned here). Kills the T+5.5 collision.
2. **Delivery gate now:** after re-download lands, measure real bytes/file
   counts from a 500-block sample ETL spike; choose static tree vs Blob
   before either spec freezes. Vercel free limits verified concretely, not
   "~1GB comfort".
3. **Gates replace hours:** G1 data-truth (counts reconcile, spot checks
   pass) → G2 foundations (schema+golden+contract test green) → G3 viz
   parity (fixtures match mock) → G4 vertical slice (1 real address end-to-end
   on PREVIEW url) → G5 coverage (10-address/5-borough matrix) → G6 trust
   (headline numbers manually verified, real-iPhone check) → G7 promote
   preview → production + launch kit. Each gate blocks the next; no clock.
4. **Coverage:** full city ships (all boroughs, all blocks with lots).
   Address matrix: 2 per borough incl. a Queens hyphenated address and a
   condo BBL.
5. **Launch trust:** every number in launch posts manually traced to source
   rows; editorial "#1 block" excludes/annotates government-exempt whales
   (bldg_class Y*/W*/etc.) — the data itself stays as-filed, only editorial
   picks are curated.
6. **Env preflight (verified live during Round 1):** Vercel CLI authed
   (`hareeshtavisi`), GeoSearch v2 live and parsing (`Pelias`), codex authed,
   final-roll re-download in flight.
7. **Preview-first deploy:** all QA on the Vercel preview URL; production
   promote is the last gate.

## Delivery gate results (measured on the real final roll, Round 1)

| Measurement | Value | Consequence |
|-------------|-------|-------------|
| Final-roll rows (period=3, rectype=1) | **1,167,962** | dedupe sanity band updated |
| Distinct blocks | **28,799** | 2× the plan's 13–14k guess → likely breaches Vercel's per-deployment file-count limit → **block JSONs go to Vercel Blob** (verify exact limit at Eng phase; static tree stays the local build artifact either way) |
| `coop_num` as condo key | **DEAD END** — 0 for condo unit lots (only set for co-op buildings) | **Condo aggregation key = (block, housenum_lo, street_name) for lots ≥ 1001** |
| Block 1398 post-aggregation | 252 lots → **53 buildings** (50 fee lots + 3 condo towers) | matches the mock's visual scale; skyline renders real blocks beautifully |
| Citywide post-aggregation | 1.17M lots → **877,878 buildings**; only 180 blocks >120 buildings (max 869) | tail-group rule ("other lots" district) applies to 0.6% of blocks |
| Duplicate parids within final roll | exist (e.g. 1-1398-14 rows S9+V9) | ETL groups by parid: **sum mv**, first owner, keep both classes annotated |
| Citywide assessed MV | **$1.911 trillion** | launch-post anchor number (verify in ETL two-way recompute) |
| $50M-club lots (raw) | **2,821** | launch-post anchor number; gold semantics per design contract below |
| Condo billing lots (≥7500) | 11,494 rows, **all mv=0, class R0** | no double-count risk; kept as billing-lot→address map for `you` matching |
| GeoSearch BBL reality | 200 E 66th → **block 1420, lot 7501** (billing lot) | HANDOFF's "block 1398" demo label was illustrative; `you`-matcher must resolve 75xx billing lots to the aggregated group by address |
| Vercel hard limits | **12,500 source / 16,000 output files**, 100MB CLI upload (Hobby) | 28,799 block files → **Vercel Blob confirmed** (local tree stays the build artifact; upload script + public CDN URLs) |

---

# Review Round 1 — /autoplan (Design phase)

Classifier: HYBRID — landing = poster (marketing rules), result view = data
surface (app rules), share card = artifact. No hard rejections triggered: no
card grids, no generic hero, real typefaces (Libre Franklin / Barlow
Condensed), tokens locked. AI-slop risk concentrates in the NEW surfaces
(states, autocomplete, badges) — contract below kills it.

## Design contract (locks absorbed from Phase 2 review; binding on SPEC-viz)

**D-1 · Nouns for aggregated reality (kills the "polished lie").** Rendered
entity = **property group** (a tax lot, or condo-unit lots grouped by
address). Header states the transformation: `252 tax lots · 53 groups ·
condo lots combined`. Block total + city rank unchanged (raw sums). Block
stat renamed **largest group share** (mock's "whale share" label retired in
production copy). Searched condo unit → its group outlined cyan, labeled
`YOUR PROPERTY GROUP · n lots · $X combined` — never "your lot" for a group.
$50M club stays **raw-lot** defined; a group gets a small gold marker only
if it CONTAINS a qualifying raw lot (never gold-by-combined-value). Group
details open a drawer listing underlying tax lots (owner as filed, mv, PIP
link each). Placement disclaimer: schematic, ordered by lot number, not a map.

**D-2 · Share artifact is the product.** One canonical **1200×630
composition** (skyline thumbnail + municipal receipt) rendered by ONE
module, consumed by (a) copy/share image and (b) per-block OG image
[OG inclusion = gate decision #9; both codex voices recommend include].
Truncation rules for address/rank/quip; deterministic template quips from
computed stats (no LLM); `Addressed lot`, not `Your lot`, in export; no UI
buttons in export; PARTIAL variant (no addressed lot) defined. Mobile
primary action = **Web Share API with image file**, fallback download;
"copy image" is the desktop label. Share action sits directly under the
first result reveal.

**D-3 · State anatomy (not just names).** LOADING: submitted address
preserved, resubmit disabled, stable result-shell skeleton, `aria-busy`,
dry-register microcopy (`PULLING THE ROLL…`). EMPTY: inline under search,
`No NYC address match`, query preserved, BBL entry exposed. ERROR_SEARCH:
search usable, retry + BBL. ERROR_BLOCK_MISSING: dedicated state, "not in
the FY27 roll", new-search + demo links. ERROR_NETWORK: context kept,
inline retry. PARTIAL: full block rendered, zero "YOU" claims, persistent
notice. DEGRADED: canvas unavailable → numeric card + accessible table.
Every state: defined focus target + live-region announcement. All copy in
the dry municipal register — error states read like DOF notices.

**D-4 · Mobile composition (locked, not QA'd into existence).** Compact
stat header above canvas; canvas `clamp(300px, 52svh, 440px)`; controls
≥44px; search button stacks under field on narrow phones; **no page-scroll
trap**: visible 44px rotate/zoom controls are primary, touch-drag secondary;
thermal selection mirrored in a DOM list/bottom sheet (cells too small as
touch targets); share reachable immediately after viz. Test matrix: 320px,
text zoom, landscape, notched iPhone, Safari bottom toolbar.

**D-5 · Accessibility as acceptance criteria.** Real
tablist/tab/tabpanel + arrow keys for mode switch; `:focus-visible` on all
controls; synchronized DOM group table whose rows select viz entities;
keyboard path into group drawer; autocomplete = accessible combobox
pattern; errors via `aria-describedby`, result focus to heading; **no
color-only encoding** (YOU = outline + label, club = marker + gold);
contrast verified per real pair including thermal labels.

**D-6 · Deterministic viz decisions.** Whale-carve threshold = **32%** (the
mock's ratified value; HANDOFF's "~40–50%" prose loses to the mock per
HANDOFF §15's own conflict rule). >120-group cap: protect YOU + club +
top-N by value, rest into "other lots" district (thermal) / back-row
low-rise strip (skyline). Layout order = lot number, always — same block
never rearranges. Landing demo buttons post-LIVE become two real famous
blocks (curated, exempt-whale-aware); fixture DEMO mode remains at
`/?demo=` for regression.

**D-7 · Deep-link arrival (the viral entry).** `/b/…` view leads with the
block skyline + compact header; sharer's lot pinned via `?lot=`; a
persistent `Look up your block` CTA sits in the header — the loop-closer
for tweet-arrivals.

## Pass ratings (0-10, after contract applied)

| Pass | Before | After | Note |
|------|--------|-------|------|
| 1 Info architecture | 7 | 9 | D-7 added the deep-link-first hierarchy |
| 2 State coverage | 5 | 9 | D-3 anatomy replaces state name-dropping |
| 3 Journey/emotional arc | 7 | 9 | share placement + <4s first-paint budget |
| 4 AI slop risk | 8 | 9 | new-surface copy bound to dry register + tokens |
| 5 Design system | 9 | 9 | tokens verbatim; new components token-bound |
| 6 Responsive & a11y | 4 | 9 | D-4/D-5 are acceptance criteria now |
| 7 Unresolved decisions | — | — | remaining: OG include (gate), /top page (gate) |

Real-data visual fixtures added to parity gate G3: condo-heavy block
(pre/post grouping), 1-group block, >120-group block, PARTIAL, group>$50M
with no qualifying raw lot, long labels, zero-value groups. (Note found by
codex: the mock's midtown fixture array actually renders 28 lots, not the
38 the label claims — fixtures extract the real array.)

## Design contract additions (Claude design voice, real-data profile)

**D-8 · Block character system (the median block gets a story).** Real
distribution over 28,799 blocks: median total **$35.0M**, p75 $61.5M, p90
$113.6M; **94.4% of blocks contain zero $50M-club lots**; median
largest-group share 0.09; 28.9% of blocks are visually flat (max/min < 3×);
4.7% single-lot; 129 blocks total ≤ $0. ETL emits a `character` class per
block — `whale | spread | flat | single | empty` — and the UI swaps the
stat set and quip family by character: median/spread blocks lead with
borough rank + ratio-to-median-block + top-group-as-multiple-of-yours
(never a dud "top 50%" percentile); flat blocks lead with evenness framing;
single-lot blocks suppress the Thermal tab and the largest-group-share stat
slot, with their own card copy. **Third gated fixture: a real median block
(~$35M, no club lot, share ~0.09) with its own card design.** Highest-
leverage product change of Round 1.

**D-9 · Zero-value and degenerate rendering.** Zero-MV lots get a minimum
visible footprint with hatch/outline + legend entry ("no assessed value on
this roll") — the thermal footer's "every lot shown" stays true. The 129
all-zero blocks get a designed empty state. Single-lot layout is named and
fixtured.

**D-10 · Card image is NEW WORK, not a port.** The mock's copy-image is a
stub (`flash("Image ready (mock)")`, lines 3100–3106 — no clipboard code
exists). The 1200×630 composition (D-2) is specified from scratch: exact
type sizes/positions, `await document.fonts.ready` before any canvas text
or countUp (else Barlow Condensed falls back and every digit re-widths),
a checked-in reference PNG diffed in CI, iOS = `navigator.share({files})`
with download fallback. Quip generator: deterministic template table
(5–8 templates keyed on character class + club count + share band) is IN
scope — the card has a dedicated line for it; a blank line there is not an
option.

**D-11 · Mobile canvas mechanics (extends D-4).** `CSS_H = 440` (mock line
929) becomes a parameter with rule `clamp(300px, 52svh, 440px)`; re-fit on
`orientationchange` and `visualViewport` resize (mock only listens to
`resize`); `touch-action: pan-y` with orbit on horizontal drag (mock's
`touch-action:none` at line 251 traps scroll); idle orbit stops after ~20s
idle and pauses via IntersectionObserver when off-screen (battery).

**D-12 · Rank universes + government parcels (decided).** Verified on the
production extract: blocks ≥70000 (utility pseudo-blocks) are already
excluded by the rectype-1 filter (0 present); the naive top-10 is still
JFK ($19.4B), LaGuardia, Battery Park City, Central Park ($7.3B, one lot).
ETL computes BOTH `rankAll` and `rankTaxable` (exempt share from
`curactextot`/`curacttot`, columns added in download v3). Block page shows
rankAll as "top X% of NYC blocks" (data as filed); `/top` (if gated in)
defaults to the taxable view, labeled; launch posts draw only from
curated taxable blocks. Verification table gets a row for this rule.

**D-13 · Journey closers.** Deep-link SSR: `/b/…` server-renders wordmark +
block identity before canvas work. Result footer: 2–3 curated real-block
links (Central Park, the user's borough's top taxable block) — data already
computed; kills the dead end. Landing post-LIVE: the two demo buttons
become two real famous blocks; DEMO badges survive only in `/?demo=`
regression mode. Loading state: typed address persists as header, canvas
area shows a static low-detail silhouette (not a spinner), >4s overrun
swaps to microcopy + numeric card first.

## Condo/billing rule (final, verified twice)

368 high-lot rows (75xx–8xxx) DO carry value — $6.7B of parking/storage
condo units (classes RG/RK/R4). Rule: **exclude only zero-value class-R0
pointer rows** (the true billing placeholders); ALL value-bearing lots
join totals; all condo-range lots (≥1001) group by
(block, housenum_lo, street_name); payload carries a lot→group map so any
searched unit (or billing-lot BBL from GeoSearch) resolves to its group —
"your unit is part of <building>". ETL acceptance: each of the 20 largest
blocks renders >1 group; MN block 16 (Battery Park City, 3,852 lots,
$7.7B) lands at a plausible tower count; a real condo address resolves to
a non-zero YOU group end-to-end (hard criterion on WS2 AND WS3).

## CEO dual-voice consensus (Round 1)

```
Dimension                          Claude-sub  Codex   Consensus
1. Premises valid?                 falsified 3 falsified 2  CONFIRMED-after-fix (all repaired in-session)
2. Right execution path?           re-sequence re-sequence  CONFIRMED: aggregate-first adopted; port kept (user D2)
3. Scope calibration?              rescope WS2 foundations-first CONFIRMED: WS2 = serialize+test, foundations pre-dispatch
4. Alternatives explored?          mock-as-app mock-as-app  RESOLVED BY USER (D2: verbatim port)
5. Competitive/market risks?       decouple launch from build  CONFIRMED: launch kit cut from locked numbers, pre-build
6. 6-month trajectory?             leaderboard/condo regrets   CONFIRMED: D-12 + condo rule retire both
```

Re-sequencing absorbed: real headline numbers are locked in-session
(production universe: **$1.911T citywide, 2,821 club lots, 28,799 blocks,
1,167,962 rows** — cross-check vs DOF FY27-final press release at trust
gate G6); ETL runtime = **Python stdlib csv** (duckdb/Polars not installed;
5s runtime measured) with the Node streaming path as the genuinely-
independent second recompute; GeoSearch **v2 pinned** with BBL at
`properties.addendum.pad.bbl` (v1 returns HTTP 410 — dead); sanity tests
assert exact expected counts (1,167,962 rows / 28,799 blocks) with
documented-exclusion tolerance, not "~1.09M".

## Design dual-voice litmus scorecard (Round 1)

```
Check                              Claude-sub      Codex     Consensus
1. Brand unmistakable first screen  YES (poster)   YES       CONFIRMED
2. One strong visual anchor         YES (skyline)  YES       CONFIRMED
3. Scannable by headlines           YES            YES       CONFIRMED
4. Each section one job             YES            YES       CONFIRMED
5. Cards necessary                  card=artifact  card=artifact CONFIRMED
6. Motion improves hierarchy        idle-orbit cost flagged  ADD budget (D-11)
7. Premium w/o decorative shadows   YES (restraint pass)     CONFIRMED
Hard rejections triggered:          0              0         CONFIRMED
Cross-model themes: median-block story (Claude) + noun relock (codex) are
the same finding at two depths; share-card-as-product flagged by BOTH; OG
inclusion recommended by ALL FOUR voices → User Challenge at final gate.
```

---

# Review Round 1 — /autoplan (Eng phase) `[subagent-only]`

Codex eng voice timed out at 10 min (logged, auto-degraded per policy).
Claude eng subagent verified claims against the real extract and generated
payloads for all 28,798 blocks. Sections 1–4 run below with its findings
absorbed; every constant it corrected is now the asserted value.

## Architecture (Section 1) — two reversals, both simplifications

```
NYC Open Data ──curl──> data/raw/ ──Python stdlib ETL──> data/generated/
                                        │  buckets/{boro}/{block//10}.json   (3,585 files, ~21KB median, 83KB max)
                                        │  index/city-stats.json  meta.json
                                        └─ full-tree validation pass (parse+schema+finite, all 28,798 payloads)
Client ──direct fetch (CORS: * verified on GET)──> GeoSearch v2
Next.js static export; ONLY serverless piece = OG route (if gated in)
```

- **R-1 · Blob REVERTED → bucketed static tree.** Real total payload:
  **77.6MB** (mean 2,694B, max 13,364B). Bucket by `(boro, block//10)` →
  **3,585 files**, far under Vercel's 12,500 — and a bucket fetch warms
  neighboring blocks. Deletes the 29k-object upload job, retry logic, and a
  runtime cross-origin dependency. (Delivery-gate Blob decision superseded
  by better evidence.)
- **R-2 · Geocode proxy DROPPED.** GeoSearch GET responses carry
  `access-control-allow-origin: *` (verified live twice). The proxy was the
  plan's own named SPOF; client-direct also distributes rate-limit load
  across user IPs. BBL direct entry stays as fallback. The "avoid CORS
  pain" justification in HANDOFF §6.4 is factually obsolete.
- Rollback story unchanged (static, `vercel rollback`); attack surface now
  ≈ zero server code (plus OG route if approved).

## Data edge-case rules (Section 2 additions — all asserted in ETL tests)

| # | Rule | Evidence |
|---|------|----------|
| E-1 | **Owner 40-char repair**: rejoin at index-40 boundary when space-split fragments form a word; payload carries `owner` (repaired) + `ownerRaw`; sources section documents the rule | 23,644 owners >40 chars; 96% split at exactly 40; **84 of 2,821 club lots affected** ("…NEW J ERSEY" $555M) |
| E-2 | **parid uniqueness ASSERTION** (replaces the sum rule — inert-but-dangerous) | 1,167,962 rows = 1,167,962 distinct parids; zero duplicates in final roll |
| E-3 | Condo key = **(boro, block, housenum_lo, street_name)**; never merge on a blank key component (fall back to per-lot identity); suppress owner label on multi-lot groups whose owners disagree | 770 blank-housenum condo lots; worst case merged 76 lots into a phantom $60.1M "building" attributed to a private individual |
| E-4 | Normalize range house numbers to low end before keying | 357,135 rows (30.6%) hyphenated/range — citywide, not a Queens quirk |
| E-5 | Zero-total blocks: typed empty state; whaleShare guarded (no 0/0); **assert no non-finite number in any payload** (Python `json.dumps(nan)` emits invalid JSON) | 129 all-zero blocks; 17,988 zero-value lots |
| E-6 | cur/fin cross-check DROPPED (vacuous — columns identical on all rows); PIP spot-checks are the real value gate | 0 mismatches measured |
| E-7 | Editorial exclusion classes = **T\*/Q\*/Z\*/P\*/U\*** (not Y\*/W\*) + hand-verify headline block | Real top-4: JFK (T1), LaGuardia (T1), Battery Park City (O4 — legit), Central Park (Q1, 1 lot, share=100%) |
| E-8 | Owner strings: no-raw rule extends to `document.title`, meta description, and OG text sinks | uncontrolled input reaches non-React sinks |

**Corrected asserted constants** (supersede the awk approximations):
blocks **28,798** · buildings post-agg **873,270** · blocks >120 groups
**174** (max **864**, SI block 2450 — explicit test at this block) · block
1398 → **52 groups** · citywide total **$1,911,446,867,962** (exact) ·
club **2,821** · embedded-newline owners in final roll: **0**.

## Tests (Section 3)

Test plan artifact → `~/.gstack/projects/pedaterre/` (written this round).
Additions: full-tree validation (parse + zod schema + finite check on all
28,798 payloads — seconds of compute, highest regression-catch value);
anchor tests against the exact citywide total and club count; E-1…E-8 each
get a named unit test; tail rule tested at SI-2450 (864 groups); condo
acceptance = MN-16 plausible tower count + 20-largest-blocks >1 group +
condo address → non-zero YOU group end-to-end.

## Hidden complexity (Section 4 → SPEC-viz requirements)

React lifecycle: mock is module-scoped singletons (ctx@904, raf@922,
un-removed window resize@3091, double-rAF init hack@3070, reduceMotion
captured once@905). Spec requires: all mutable state in refs created
inside the effect; one teardown (cancel rAF, remove listeners);
ResizeObserver on the panel; LIVE `prefers-reduced-motion` matchMedia
listener (criterion #9 is stale-on-toggle otherwise); StrictMode
double-mount safe. Perf: `recomputeFit()` (double 8-corner pass) runs
per-frame in the mock — memoize on (lots, canvasSize, zoom), not per-frame.
Canvas hexes duplicating tokens (#6ed4ff etc.) become imports from one
token module. Lot objects are Map/Set identity keys in the mock — layout
must not clone them between layout and draw.

## ENG consensus table

```
Dimension                    Claude-sub           Codex        Consensus
1. Architecture sound?       simpler than planned  [timeout]   R-1/R-2 adopted [subagent-only]
2. Test coverage sufficient? gaps found+filled     [timeout]   full-tree pass added
3. Performance risks?        per-frame fit flagged [timeout]   memoization required
4. Security threats?         2 proxy gaps → moot   [timeout]   proxy dropped; sink rule extended
5. Error paths handled?      NaN/zero-block gap    [timeout]   E-5 asserted
6. Deployment risk?          static-only now       [timeout]   file-count issue dissolved
```

---

# Round 1 — Final approval gate (user-decided 2026-07-27)

| Gate item | Decision |
|-----------|----------|
| D3 · Per-block OG images (User Challenge vs HANDOFF "optional") | **INCLUDE** — thin serverless route over the mandatory D-2 card renderer; the app's only server code |
| D4 · /top leaderboard | **INCLUDE** — taxable universe, labeled (D-12) |
| D5 · Owner 40-char repair vs "as filed" lock | **REPAIR + DOCUMENT** — ownerRaw retained, rule in sources section |
| D6 · Round 1 | **APPROVED → /spar next**, then rounds 2–3 on affected phases |

Superseded tasks in the aggregate: ceo-T2 (coop_num grouping → replaced by
design-T6/eng-T4 address rule), ceo-T3 (duckdb → Python stdlib, decision
#23). 23 tasks stand: 15 P1 / 8 P2, less the 2 superseded → **21 net**.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean (via /autoplan) | 2 proposals → both gated IN; 0 critical gaps open |
| Codex Review | `/codex review` | Independent 2nd opinion | 3 | issues_found → absorbed | CEO+design ran; eng timed out |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean (via /autoplan) | 19 issues, all absorbed; 0 critical gaps open |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean (via /autoplan) | score 4/10 → 9/10, 13 contract decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | skipped | consumer product, no dev-facing surface |

**CROSS-MODEL:** codex + Claude subagents converged independently on: share
card/OG as the product's core artifact (4 voices), mobile scroll-trap,
government-parcel ranking contamination, and real-data invalidation of
fixture-only design. Zero unresolved cross-model tensions — every
disagreement was settled by measurement or by the user at a gate.
**VERDICT:** CEO + ENG + DESIGN CLEARED — ready for /spar, then spec + dispatch.
NO UNRESOLVED DECISIONS

---

# Round 1 — /spar (Grok adversarial) — reconciliation

Grok's case: over-reviewed/under-built; review burned the real constraint
(daylight) and "gates not hours" hid it; codex can't one-shot a 13-clause
contract; **the OG route has no data-access spec** (Eng removed runtime data
access, then the gate approved a route needing it — a cross-phase gap no
voice caught); no contingency hour exists.

| Grok point | Verdict | Action |
|------------|---------|--------|
| Clock burned, rounds 2–3 would kill ship-today | **ADOPTED** | Loop re-scoped: round 2 attacks the SPECS in parallel with codex building; round 3 attacks the built artifact at G3. **17:00 hard checkpoint** with pre-agreed cut list: (1) drop /top, (2) OG → static curated-only, (3) defer address search behind deep links + BBL entry. Cuts are declared, never silent |
| OG route data access unspecified | **ADOPTED — real structural gap** | OG route self-fetches bucketed static JSON over HTTP from its own deployment; edge-cache immutable. Spec'd in SPEC-viz §OG |
| Codex one-shot fidelity vs 13 clauses | **ADOPTED (split)** | WS1 → **WS1a** scaffold + verbatim canvas port (line-map driven) and **WS1b** card renderer + states + mobile (from-scratch, contract-heavy). Separate specs, acceptance, worktrees |
| Stress cases meet code only at integration | **REJECTED (misread)** | Real-data extremes (SI-2450/864 groups, median block, Central Park 1-lot) are pre-integration G3 fixtures; golden payloads generated BEFORE dispatch in foundations |

**ROUND 1 CLOSED.** Build begins: foundations (schema + golden payloads,
this session) → SPEC-etl + SPEC-viz-a + SPEC-viz-b → parallel codex
dispatch → round 2 spec-spar in parallel.

---

# Round 2 — /spar on the specs (mid-build) — reconciliation

| Grok finding | Verdict | Action |
|--------------|---------|--------|
| No spec wires real data into the app; all gates pass while prod renders fixtures + 404 OG | **ADOPTED** (sharpest) | SPEC-address.md written NOW: owns data publication (`data/generated/buckets` → `apps/web/public/data/buckets`), the production `/b/[boro]/[block]` route + fetch + states, you-resolution. G4 vertical slice cannot pass without it |
| `output:'export'` incompatible with the OG edge route; config ownership unassigned | **ADOPTED** | Explicit: standard Next.js build on Vercel (static-generated pages + ONE edge function). PLAN's "static export" line superseded. Verified at WS1a diff review |
| drawSkylineThumb contract signed only by WS1b | **ADOPTED** | Signature pinned by WS1b's param type; `lib/share/thumbAdapter.ts` assigned to integration (this session), single binding point |
| D-2 "ONE renderer" vs canvas card + SVG OG mirror | **ADOPTED w/ modification** | D-2 refined: ONE layout contract (`cardLayout.ts` — geometry, strings, truncation) consumed by BOTH backends; edge runtime cannot run canvas, so backends differ, structure cannot. Reference PNGs re-rendered with the real thumb at integration and re-reviewed |
