# taxlots — ONE-SHOT EXECUTION HANDOFF

**Product name (locked):** `taxlots`  
**Workspace:** `/Users/hareeshnagaraj/Development/pedaterre`  
**Audience of this doc:** an implementer (Claude / human) who will build production in **one continuous pass**.  
**Do not re-ideate the product.** Execute from this handoff + the live design mock.  
**Date of handoff:** 2026-07-27

---

## 0. Mission (read once, then build)

Ship **taxlots**: look up a NYC address → see the **tax block’s assessed market value** (DOF), how the block ranks citywide, and two world-class interactive visualizations (isometric skyline + thermal treemap), plus a viral share card and honest sources/verification.

This is a **≤1-day hackathon product** that must feel **classy municipal data craft**, not AI slop and not sparkly fintech. Playful + data-nerd tone.

**Origin:** Viral interest in NYC DOF property assessment data (every tax lot, owner as filed, market value) — e.g. Trace Cohen’s July 2026 circulation of the DOF assessments dump. Source of truth is the **lot-level assessment roll**, not a PDF summary.

---

## 1. Absolute locks (do not renegotiate)

| Lock | Decision |
|------|----------|
| Name | **taxlots** (lowercase product wordmark; never “Block Worth” in production UI) |
| Domain | TBD later — ship on free host (Vercel) first |
| Core unit | **Borough + tax block** aggregate of lot market values; lot is the atom |
| Value definition | **DOF assessed market value** only — never sale price, Zestimate, AVM, or “estimated worth” without the assessment label |
| Owner display | **Exact string as filed** — no fuzzy entity resolution, no “real person behind LLC” magic |
| Chatbot | **None** |
| Full GIS / parcel polygons | **Out of v1** (grid placement from block lot order / synthetic grid is fine; real footprints later optional) |
| Datastore | Free/cheap: **static JSON + optional Turso/SQLite** hybrid later; no expensive managed DB for day-1 |
| Design source of truth | `design/block-worth-mock.html` (rename to taxlots; keep visual system) |
| Brand tone | Utilitarian municipal + dry humor; **cannot be corny** |
| AI attribution | **Zero** in commits, PRs, code comments, README footers, deploy notes, or any user-visible surface |

### Explicit non-goals (v1)

- Chat / LLM Q&A over parcels  
- Owner fuzzy matching / KYC / “who really owns this”  
- Full city map with interactive GIS tiles as primary UX  
- Multi-city  
- Auth / accounts / paywall (day-1 free)  
- Mobile native apps  
- Real estate listings or comps  
- Legal advice framing  

---

## 2. What already exists (do not throw away)

### 2.1 Design lab (shipped as interactive mock)

| Path | Role |
|------|------|
| `design/block-worth-mock.html` | **Latest polished mock** — skyline + thermal + share card + sources (~3.1k lines, self-contained HTML/CSS/JS, canvas) |
| `design/index.html` | Iteration gallery (`?iter=N`) |
| `design/iterations/r0-wow-baseline.html` | Early snapshot |
| `design/iterations/r5-polish.html` | Mid snapshot |
| `design/SOURCES.md` | Official sources + claim verification table |
| `design/.vercel` | Prior deploy project (name `design` → `design-livid.vercel.app`) |

### 2.2 Live design URLs (as of handoff)

- Gallery: https://design-livid.vercel.app/  
- Latest mock: https://design-livid.vercel.app/block-worth-mock.html  
- Sources anchor: https://design-livid.vercel.app/block-worth-mock.html#sources  

Open the mock before coding. **Match this craft level.** Production should feel like a promotion of this mock to real data, not a rewrite that loses visual quality.

### 2.3 Preview honesty

Mock uses **illustrative lot values** with DEMO badges. Production flips DEMO → LIVE when queries hit ingested DOF data. Never present demo numbers as live without badges.

### 2.4 Demo scenarios baked into the mock (replace with real BBLs once ETL works)

**Midtown whale block** (illustrative):

- Address label: `200 E 66th St → Manhattan Block 1398`  
- BBL framing: `Manhattan · BBL 1-01398 · 38 lots`  
- Block total: `$847.2M` assessed  
- Rank: `Top 4% of NYC blocks`  
- Whale share: `62%` (one tower dominates)  
- Quip: *One tower is 62% of the block’s assessed value. Everyone else is a row house in its shadow.*  
- Lots: grid with `{c, r, v}` where `v` is $M; `you: true` highlights user lot; `club: true` for $50M+  

**Quiet Brooklyn block** (illustrative):

- `347 Jefferson St → Brooklyn Block 3184`  
- Total `$196.4M`, top 22%, whale 9%, spread value  

Use these as **UX regression fixtures** even after real data ships (keep a “demo mode” or snapshot fixtures).

---

## 3. Product surfaces (build all of these)

### 3.1 Landing

- Dark void stage (`#080706`), condensed display type, short promise  
- Address search (production: GeoSearch → BBL → block)  
- Two demo entry buttons (midtown / brooklyn) until search is live  
- One-line honesty: assessed market value, not sale price  
- Link to `#sources`  

### 3.2 Result view

1. **Isometric skyline (canvas)**  
   - Height ∝ lot assessed MV  
   - YOU lot = cyan (`#6ed4ff`)  
   - $50M club = gold (`#e0b04a`)  
   - Orbit drag, zoom, idle orbit (respect `prefers-reduced-motion`)  
   - **AABB fit** so full block always frames (see §7 craft rules)  
   - Chrome: mode tabs **outside** canvas; HUD strip only in skyline mode  

2. **Thermal treemap (canvas)**  
   - Area ∝ lot MV; squarified layout (Bruls et al.)  
   - Hierarchical carve when one lot is extreme whale (primary slab + rest district)  
   - Color ramp cool → warm by value  
   - Label collision avoidance; share ticks only on specials/editorial  
   - **Legend is HTML below canvas**, never drawn as overlapping HUD on the map  
   - Hover + pin for lot details  

3. **Share card**  
   - Brand wordmark **taxlots** (replace “Block Worth”)  
   - Where / subline / dollars / rank / quip  
   - Stats: Your lot · Tallest lot · City rank · Whale share  
   - Stamp id e.g. `TL-MN-1398-FY27`  
   - Source line: DOF assessed market value · not sale/Zestimate · link nyc.gov/finance  
   - Actions: copy share link · copy image (html2canvas or canvas export of card)  

4. **Citywide inequality strip**  
   - $50M club count + share of city MV  
   - **Must recompute from full roll in production** — never hard-code final numbers  

5. **Sources & verification**  
   - Same content spirit as mock + `design/SOURCES.md`  
   - Verification table with claim → definition → source field  
   - Footer: roll year + short extract hash when live  

---

## 4. Design system (copy exactly)

### 4.1 Tokens

```css
:root {
  --void: #080706;
  --ink: #efe9dd;
  --ink-dim: #8f877c;
  --paper: #f4efe4;
  --paper-ink: #141210;
  --stamp: #e23d2d;   /* red accent / selection / brand slash */
  --gold: #e0b04a;    /* $50M club */
  --you: #6ed4ff;     /* user lot */
  --font: "Libre Franklin", system-ui, sans-serif;
  --num: "Barlow Condensed", "Arial Narrow", sans-serif;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 4.2 Type

- **UI body:** Libre Franklin 400/500/600/700  
- **Numbers / display / brand:** Barlow Condensed 600/700/800, uppercase, tight tracking on headlines  
- Anti-alias: `-webkit-font-smoothing: antialiased`  
- Selection: stamp red on white text  

### 4.3 Visual philosophy (hard-won)

- **Classy municipal, not sparkle.** Bloom, god-rays, dust particles: **off by default** (flags exist in mock; keep off).  
- **Toolbar / chrome outside the map.** Canvas = map only. Mode tabs live above; thermal legend lives below in HTML.  
- **No overlapping labels on thermal.** Collision pad + drop labels that don’t fit; share ticks only for you/club/editorial.  
- **Skyline framing:** project all 8 corners of each building AABB at **full height**, pad ~12% (usable ~76%), optical pan bias slightly down (`h * 0.54`). Label headroom for YOU plate.  
- **Thermal background** cooler navy void; skyline background warm charcoal.  
- Restraint > FX. If it looks “AI generated dashboard,” delete the effect.  

### 4.4 Brand rename checklist

Search-replace across UI and docs:

| Old | New |
|-----|-----|
| Block Worth | taxlots |
| Block Worth · | taxlots · |
| `BW-MN-` stamp prefix | `TL-MN-` (etc.) |
| block-worth-mock.html | `taxlots-mock.html` or promote into app route |
| “Their share” land tease | keep or tighten; avoid corny slogans |

Wordmark style on card: `taxlots` with optional red accent on a letter/span if it reads clean (mock used `Block <span>Worth</span>` with stamp color on second word — adapt without corniness; utilitarian `taxlots` alone is fine).

---

## 5. Data model & sources

### 5.1 Official sources

| What | URL |
|------|-----|
| DOF Property Assessments | https://www.nyc.gov/site/finance/property/property-assessments.page |
| Open Data · Tax classes 1–4 | https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data-Tax-Classes/8y4t-faws |
| Open Data · related valuation | https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data/yjxr-fw8i |
| Property Information Portal | https://propertyinformationportal.nyc.gov/ |
| Address → BBL | NYC Planning Labs **GeoSearch** API |

Confirm exact column names against the published **record layout** for the roll year (linked next to DOF zips). Prefer Open Data SODA API or bulk CSV/zip for ingest.

### 5.2 Canonical fields (production)

| UI claim | Computation | Source |
|----------|-------------|--------|
| Lot value | `market_value` (year-specific MV column) | DOF roll |
| Block total | `SUM(mv)` group by `borough + block` | BBL parse |
| City rank | dense rank of block totals descending | derived |
| Percentile | rank / n_blocks | derived |
| Whale share | `max(lot_mv on block) / block_total` | derived |
| $50M club | lots with `mv > 50_000_000`; city count + share of city MV | derived |
| LLC share | `sum(mv where owner matches entity regex) / block_total` | owner as filed |
| Owner | exact string | owner field |
| BBL | borough-block-lot | roll / GeoSearch |

**BBL encoding:** borough code (1=MN, 2=BX, 3=BK, 4=QN, 5=SI) + block + lot. Block is the product grain for “block worth.”

### 5.3 LLC / entity regex (document in ETL; start simple)

Case-insensitive match on owner string substrings / tokens, e.g.:

- `LLC`, `L.L.C.`, `L L C`  
- `LP`, `L.P.`, `LLP`  
- `CORP`, `CORPORATION`, `INC`, `INCORPORATED`  
- `TRUST`, `TR` (careful — false positives; prefer word boundaries)  
- `HOLDINGS`, `PARTNERS`, `REALTY`, `PROPERTIES`  

This is a **heuristic for “filed as entity,” not legal truth.** UI copy must say “as filed” / “LLC patterns,” never “shell company detection.”

### 5.4 Ingest metadata (required)

Every production build stores:

```
roll_year          # e.g. FY2027 / FY27 as published
extract_sha256     # hash of source file(s)
ingested_at        # ISO timestamp
source_url         # DOF or Open Data URL used
row_count          # lots ingested
```

Footer shows: `DOF FY27 · extract ab12cd3 · market value (assessment)`.

### 5.5 Production verification checklist (must pass)

1. Ingest DOF zip or Open Data extract; persist metadata above.  
2. Unit tests: known BBLs vs raw CSV / PIP for MV + owner.  
3. Aggregate job: city $50M club count + MV share match independent Polars/SQL recompute on same file.  
4. Footer: roll year + assessment label + DOF link + short hash.  
5. Each lot deep-links to PIP with BBL when possible.  
6. **Never hard-code citywide headline stats** in production UI.  

---

## 6. Recommended architecture (one-shot build)

Keep it simple enough to finish in a day while matching mock quality.

### 6.1 Stack (recommended)

```
apps/web          Next.js (App Router) OR Vite + React — your call; Next.js if API routes needed
                  OR pure static export if API is separate

packages/ or /
  scripts/etl     Node or Python (prefer Python + Polars OR Node + duckdb for CSV speed)
  data/           generated JSON (git-lfs optional) or served from public/

Host: Vercel free tier
DB day-1: static per-block JSON files + city index JSON
DB later: Turso (libsql) if query volume needs it
```

**Ponytail default:** Prefer static precompute over live SQL for v1:

1. ETL → `blocks/{borough}/{block}.json` + `index/city-stats.json` + `index/block-ranks.json`  
2. Edge/API: address → GeoSearch → BBL → fetch block JSON  
3. Client: render skyline + thermal from lot array (same schema as mock `lots`)  

If full NYC static dump is too large for git, store generated artifacts in object storage or generate at deploy; keep **schema + fixtures** in repo.

### 6.2 Lot schema for the viz (match mock)

```ts
type Lot = {
  bbl: string;           // "1-01398-0021"
  lot: number;
  c: number;             // grid col for iso (synthetic if no geometry)
  r: number;             // grid row
  v: number;             // market value in millions (or use raw dollars + format consistently)
  owner?: string;        // as filed
  you?: boolean;         // set client-side for searched lot
  club?: boolean;        // mv > 50e6
};

type BlockPayload = {
  borough: string;
  block: number;
  bblPrefix: string;     // "1-01398"
  addressHint?: string;
  totalMv: number;       // dollars
  totalM: number;        // millions for display
  rank: number;
  percentile: number;    // 0–100, "top X%"
  whaleShare: number;    // 0–1
  llcShare: number;      // 0–1
  nLots: number;
  rollYear: string;
  extractHash: string;
  lots: Lot[];
  quip?: string;         // optional generated one-liner
};
```

**Grid placement:** For v1 without footprints, assign `(c,r)` by sorting lots (e.g. by lot number) into a near-square grid. Document that placement is schematic, not cadastral geometry.

### 6.3 Address resolution

1. User types address  
2. Call GeoSearch (NYC Planning Labs) autocomplete / search  
3. Parse BBL from result  
4. Load block payload for borough+block  
5. Mark matching lot as `you`  

Fallback: BBL direct entry, or demo buttons.

### 6.4 API surface (minimal)

```
GET /api/geocode?q=...          → proxy GeoSearch (avoid CORS pain)
GET /api/block/:borough/:block  → BlockPayload
GET /api/stats/city             → $50M club + totals + roll meta
GET /api/health                 → roll_year, hash, row_count
```

If fully static: no geocode proxy; client hits GeoSearch directly if CORS allows, else tiny serverless proxy.

### 6.5 Share links

```
https://taxlots.vercel.app/b/1/1398?lot=21
https://taxlots.vercel.app/?demo=midtown   # fixtures
```

OG tags optional day-1; copy link + card image is enough for virality.

---

## 7. Viz implementation notes (port from mock — do not reinvent poorly)

The mock at `design/block-worth-mock.html` already implements production-grade canvas craft. **Port algorithms; do not replace with a cheap chart library that looks worse.**

### 7.1 Isometric skyline — must preserve

- `project(x,y,z)` isometric projection with angle + tilt  
- `hScale(v)` height from value  
- `recomputeFit()` AABB of **8 corners** per building at full height, pad 0.76, pan to center with optical bias  
- Label pills for YOU / tallest with collision  
- Drag orbit + zoom; idle slow orbit when no interaction  
- Reduced motion: no idle, instant rise  

### 7.2 Thermal — must preserve

- Squarified treemap (`squarify`, `worstAspect`, `layoutRow`)  
- Extreme skew: if max lot ≥ ~40–50% of block, hierarchical layout (whale slab + rest pack) with district frames  
- `thermalRGB(v, maxV)` cool→warm ramp  
- Reveal animation staggered (respect reduced motion)  
- HTML footer legend outside canvas  
- Hit testing for hover/pin  

### 7.3 Chrome structure (critical — fixed after many polish rounds)

```
.viz-shell
  .viz-toolbar          ← mode tabs Skyline | Thermal  (OUTSIDE canvas)
  .iso-panel
    canvas#city-canvas  ← map ONLY
    .iso-hud            ← skyline hints only; hidden in thermal
  .thermal-footer       ← legend + meta; shown only in thermal mode
.card#share-card
```

**Never** put mode tabs or thermal legend as absolute overlays that cover cells.

### 7.4 Iteration flags (historical)

Mock used `?iter=1..20` feature flags. Production can delete flags and ship final craft (≈ iter 20 restraint pass: craft over FX).

---

## 8. Copy & tone

- Playful data nerd, dry, specific numbers  
- Always disclaim: **assessed market value**, not sale price or Zestimate  
- Quips should be one sentence, observational, non-corny  
  - Good: *One tower is 62% of the block’s assessed value.*  
  - Bad: *Your block is RICH AF 🔥🔥* / *Net worth glow up*  
- Name **taxlots** is utilitarian on purpose — don’t add a cutesy tagline that undermines it  
- Sources section is part of the product, not a legal footer afterthought  

---

## 9. Rename + repo layout target

### 9.1 Target tree after one-shot

```
/
  README.md
  HANDOFF.md                 # this file
  LICENSE                    # optional MIT
  .gitignore
  package.json               # monorepo or single app
  apps/web/                  # product UI
  scripts/etl/               # ingest + aggregate
  data/fixtures/             # midtown + brooklyn demo payloads
  data/generated/            # gitignored or CI artifact
  design/                    # keep mock as visual reference (rename brand strings)
  design/SOURCES.md
```

### 9.2 Day-1 gitignore (root)

```
node_modules/
.next/
dist/
.vercel/
.env
.env.*
data/generated/
*.zip
.DS_Store
```

---

## 10. ONE-SHOT EXECUTION PLAN (do in order)

Execute end-to-end without waiting for re-confirmation of product decisions. Ship when acceptance criteria pass.

### Phase A — Brand + scaffold (30–60 min)

1. Ensure git repo initialized (already done at handoff if commit exists).  
2. Scaffold `apps/web` (Next.js App Router recommended) with TypeScript.  
3. Global CSS tokens from §4.1; load Libre Franklin + Barlow Condensed.  
4. Global rename: no “Block Worth” strings in app UI.  
5. Port landing + result layout structure from mock (HTML structure first).  
6. Commit: `scaffold taxlots app shell and design tokens`.  

### Phase B — Viz port (2–4 hr) — **do not skip quality**

1. Extract canvas skyline + thermal modules from `design/block-worth-mock.html` into TS modules (`SkylineCanvas`, `ThermalCanvas`, or one `BlockViz` with mode).  
2. Wire demo fixtures (midtown / brooklyn) identical to mock numbers for visual parity.  
3. Share card component with copy link + copy image.  
4. Sources page/section with verification table; badges DEMO until live.  
5. Verify framing (AABB), thermal no-overlap, toolbar outside canvas.  
6. Commit: `port skyline and thermal viz from design mock`.  

### Phase C — ETL (2–4 hr)

1. Script downloads or accepts path to DOF/Open Data extract.  
2. Normalize to lot rows: bbl, borough, block, lot, mv, owner, building class if present.  
3. Aggregate blocks; compute ranks, whale share, llc share, club flags.  
4. Write `city-stats.json` + sample of N blocks OR full static tree if size allows.  
5. At minimum for ship: **full city stats + enough blocks to demo real addresses** in Manhattan/Brooklyn; ideal: all blocks.  
6. Unit tests: recompute $50M club two ways; spot-check 3 BBLs.  
7. Commit: `etl: ingest dof roll and emit block payloads` (do not commit multi-GB raw zips).  

### Phase D — Address → block (1–2 hr)

1. GeoSearch proxy + autocomplete UI.  
2. Resolve BBL → load block payload → mark `you` lot.  
3. Deep link `/b/[borough]/[block]?lot=`.  
4. Error states: address not found, lot missing, data not ingested.  
5. Commit: `address search to block payload`.  

### Phase E — Production honesty + deploy (1 hr)

1. LIVE badge when data is real; DEMO only on fixtures.  
2. Footer: roll year, hash, assessment disclaimer, DOF link.  
3. PIP links per lot.  
4. Deploy Vercel project **taxlots** (new project; don’t reuse design-lab naming for prod).  
5. README with run instructions + data refresh.  
6. Commit: `ship live data badges and deploy config`.  

### Phase F — Viral share pass (30–60 min)

1. First-load journey: land → demo or search → skyline → thermal → copy share.  
2. Mobile: card stacks, canvas height usable, tabs tappable.  
3. Meta title/description: utilitarian (`taxlots — NYC tax block assessed value`).  
4. Optional: simple OG image later — not a blocker.  

---

## 11. Acceptance criteria (definition of done)

Ship only when **all** are true:

| # | Criterion |
|---|-----------|
| 1 | Product name **taxlots** everywhere user-facing; zero “Block Worth” |
| 2 | Skyline + thermal both work for demo + at least one real ingested block |
| 3 | Heights/area use **assessed market value**; disclaimer visible |
| 4 | Share card copy link works; card looks screenshot-worthy |
| 5 | Sources section + verification table present |
| 6 | Citywide $50M stats either LIVE from ETL or clearly DEMO-badged |
| 7 | Toolbar/legend never overlap thermal cells |
| 8 | Skyline fully framed (no towers cut off) at default view |
| 9 | `prefers-reduced-motion` respected |
| 10 | Footer shows roll metadata when LIVE |
| 11 | No AI attribution in git history or README |
| 12 | Clean install path documented: `npm i && npm run dev` (or monorepo equiv) |
| 13 | Deployed public URL works on mobile Safari + desktop Chrome |

---

## 12. Hard lessons from design iteration (do not re-learn)

These were fixed through many polish rounds — treat as **requirements**:

1. **Thermal “shoddy / overlapping”** was caused by putting mode tabs + HUD + legend on top of the canvas. Fix: map-only canvas; HTML chrome outside.  
2. **Skyline off-frame** was fixed with full-height 8-corner AABB fit + padding + optical pan — not by shrinking towers arbitrarily.  
3. User feedback preferred **classy restraint** over particle/bloom spectacle.  
4. Sources/verification are part of trust for a viral data product — keep them prominent.  
5. Naming: “Block Worth” was rejected as corny; **taxlots** is locked.  

---

## 13. Suggested commit style

- Imperative, short, no AI trailers  
- Examples:  
  - `init taxlots repo with design mock and handoff`  
  - `port block viz modules from design mock`  
  - `etl: aggregate nyc dof assessment roll by block`  

**Never** add `Co-Authored-By`, “Generated with …”, or model names in commits or PRs.

---

## 14. Out of scope for the one-shot (explicit defer)

- Real parcel polygon footprints  
- Owner network graphs  
- Historical multi-year rolls  
- i18n  
- Auth  
- Paid API tiers  
- Non-NYC cities  

If time remains after acceptance criteria: improve quip generation rules, add more real-block deep links on landing, or Turso for query flexibility.

---

## 15. How to use this handoff

1. Read §0–§2.  
2. Open live mock URL and `design/block-worth-mock.html` side by side.  
3. Execute §10 phases A→F without reopening product debates.  
4. Tick §11 checklist.  
5. Deploy. Send the public URL.

**If something in the mock conflicts with this doc:** prefer the **visual craft** of the mock and the **data rules** of this doc + `design/SOURCES.md`.

---

## 16. Quick reference — key files to read first

```
HANDOFF.md                          ← you are here
design/SOURCES.md                   ← claims & sources
design/block-worth-mock.html        ← UI + viz algorithms (port this)
design/index.html                   ← iteration gallery (reference only)
```

---

*End of handoff. Build taxlots.*
