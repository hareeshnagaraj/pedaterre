# SPEC — WS1a: Next.js scaffold + VERBATIM canvas port

Objective: stand up `apps/web` (Next.js App Router, TypeScript) and port the
mock's two canvas visualizations with zero visual drift. Read PLAN.md
sections "Design contract" (D-1, D-6, D-11), "Hidden complexity (Section 4)"
and HANDOFF.md §4 (tokens/type) + §7 (viz rules + chrome) — binding.
The design source of truth is `design/block-worth-mock.html`; **port its
function bodies, do not reimplement.** Product name is `pedaterre`
(lowercase) — zero "Block Worth" strings anywhere
(`grep -ri "block worth" apps/` must return nothing).

## Mock structural map (verified line ranges)
- Tokens `:root` 15–27 — copy into `apps/web/app/globals.css` verbatim;
  fonts via `next/font/google` (Barlow Condensed 600/700/800, Libre
  Franklin 400–700).
- Chrome: .viz-shell 624–649, .viz-toolbar/.mode-switch 625–631 (CSS
  196–247), .iso-panel 632–638 (248–268), canvas 633, .iso-hud 634–637,
  .thermal-footer 639–648 (292–348). Mode = two class toggles
  (`is-thermal` on shell + panel). Tabs OUTSIDE canvas; legend = static
  HTML below; HUD hidden in thermal. NEVER overlay chrome on the canvas.
- Skyline JS: resizeCanvas 931–938 (DPR cap 2), hScale 940–947,
  computeOrigin 949–953, project 956–973, recomputeFit 979–1045 (8-corner
  AABB, pad 0.76 line 1020, optical bias h*0.54 line 1044), drawLabel
  1060–1083, lotRise 1086–1095, drawBuilding 1097–1455 (windows PRNG seed
  line 1305 — keep), label engine 1456–1567, drawIso 1569–1795, pointer
  handlers 2957–3023, frame loop 2887–2929.
- Thermal JS: thermalRGB 1803–1841, layoutTreemap 1846–1908 (whale carve
  threshold **0.32** line 1855 — the ratified value), squarify family
  1933–2025, drawThermal 2055–2858, thermalHit 2944–2955.
- setVizMode 2860–2885; showResult double-rAF 3070–3072 is deliberate
  (canvas needs layout width before fit) — preserve the semantics.
- DROP: ?iter plumbing 800–846, .review-bar 572–575, bloom 1753–1761,
  initDust 1047–1058, god rays 1617 (all retired FX — hard off).
- Canvas hardcoded hexes (#6ed4ff, #e0b04a shades etc.) → import from one
  `lib/tokens.ts` module; values unchanged.

## Port architecture (the ONLY structural change allowed)
- `apps/web/lib/viz/` pure modules: `treemap.ts` (squarify/worstAspect/
  layoutRow/layoutTreemap — pure, returns districts instead of writing a
  global), `projection.ts` (project/recomputeFit — fit state as explicit
  return value, not globals), `color.ts`, `types.ts`.
- `apps/web/components/BlockViz.tsx` owns canvas + rAF. React lifecycle
  rules (PLAN.md Section 4 — binding): all mutable state in refs created
  inside the effect; ONE teardown (cancel rAF, remove listeners);
  ResizeObserver on the panel (not window resize); LIVE
  prefers-reduced-motion matchMedia listener; StrictMode-double-mount
  safe. `recomputeFit` memoized on (lots, canvas size, zoom) — NOT
  per-frame like the mock.
- Lot/group objects keep object identity between layout and draw (the
  mock uses them as Map/Set keys — do not clone mid-pipeline).
- Mobile (D-11): canvas height `clamp(300px, 52svh, 440px)` — CSS_H
  becomes a prop; re-fit on orientationchange + visualViewport resize;
  `touch-action: pan-y` on .iso-panel with orbit bound to HORIZONTAL drag
  only; wheel zoom desktop, pinch zoom touch; idle orbit stops after 20s
  idle and pauses via IntersectionObserver off-screen. Mode tabs
  min-height 44px.
- D-1 nouns (data display only in this WS): stat labels read
  "largest group share" not "whale share"; header line
  `{nLots} tax lots · {nGroups} groups · condo lots combined` when
  nLots > nGroups.

## Data
Schema: infer the TypeScript type + zod schema from the six golden
fixtures in `data/fixtures/*.json` (they are the contract; `v` is $M,
`totalMv` dollars). Put schema in `apps/web/lib/schema.ts` with a test
that parses all six. Dev page `/fixture/[name]` renders any fixture by
file name; `/?demo=midtown-1398` etc. work too. No network fetches in
this WS — fixtures only, imported/served locally.

## Acceptance (all must pass)
1. `cd apps/web && npm run build && npm test` green.
2. `npm run shots` — Playwright (chromium only; devDependency is allowed)
   captures `/fixture/<name>` for ALL SIX fixtures in BOTH modes at
   1280×900 and 390×844 → `apps/web/shots/*.png`. Every fixture renders:
   no blank canvas, no cut-off towers (AABB framing), no overlapping
   chrome, tail-si-2450 (120 groups) legible, centralpark-1111 (single)
   sane, zero-mn-213 shows the empty character state placeholder (simple
   is fine — WS1b designs it).
3. Reduced-motion: emulate `prefers-reduced-motion` in one shot run —
   no idle orbit, instant rise.
4. `grep -ri "block worth" apps/` empty. No AI attribution anywhere.

## Boundaries
Own: `apps/web/**` EXCEPT `apps/web/lib/share/**` and
`apps/web/components/states/**` (WS1b's), and root `package.json` if a
workspace file is needed (keep minimal). Do NOT touch: scripts/,
data/ (read-only), design/ (read-only), PLAN.md, SPEC-*.md. Commit
nothing — leave the worktree dirty for review.
