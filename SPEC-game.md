# SPEC — WS7: THE ASSESSOR'S GAME (`/game`)

Objective: the product's viral mechanic. Two real NYC blocks, rendered as
skylines with every number stripped out. The player guesses which one the
assessment roll values higher. Streak, reveal, share.

Read PLAN.md's design contract and study `apps/web/app/top/page.tsx`,
`components/BlockViz.tsx`, `lib/data.ts`, and `lib/share/**` before writing
anything. Register is deadpan municipal throughout — this is a civil-service
quiz, not a game show. No confetti, no sound, no emoji, no exclamation marks.

## Mechanic

1. Two blocks appear side by side, each rendered as an isometric skyline
   with **no values, no labels, no rank, no address** — borough name only
   (it makes the guess interesting rather than arbitrary).
2. Player picks a side. Both values reveal simultaneously with a short
   count-up; the correct side gets a hairline `--you` cyan frame, the wrong
   side dims. Copy: `THE ROLL SAYS` above the reveal.
3. Streak increments or resets. A run ends on the first wrong answer.
4. After reveal: `NEXT PAIR` advances; both blocks become links to their
   `/b/...` pages so the player can go read the real thing.
5. Run ends → a share card and a `PLAY THE SAME RUN` link.

## Pairing (the part that decides whether this is fun)

Source: `/data/block-ranks.json` (already published — every block with
`m` = totalM and `t` = taxable). Client-side, no new ETL.

- Exclude blocks with `t = 0` (government/exempt-dominated) — an airport
  beating a brownstone is not a guess, it's a trick.
- Exclude blocks whose payload has fewer than 3 groups: a one-tower square
  gives the player nothing to look at.
- Ratio band: pick pairs where the higher value is between **1.15× and
  3.0×** the lower. Below that it's a coin flip; above it it's obvious.
- Difficulty ramps with streak: the band narrows as the run goes on
  (by streak 10 it should be near 1.15×). State the ramp in a comment.
- Never repeat a block within a run.

**Seeded and reproducible.** The run is driven by a seeded PRNG (small
xorshift, written inline — no dependency). The seed lives in the URL:
`/game?seed=<base36>`. Same seed → same sequence of pairs, so a shared run
is genuinely the same challenge. A bare `/game` mints a fresh seed and
replaces the URL.

## Rendering

Reuse `BlockViz` — do not fork it. Add a **blind mode** prop that suppresses
value labels, the YOU plate, and the club/gold markers, and disables the
interaction affordances (no orbit hint, no zoom); everything else about the
render stays identical. Keep the change to `BlockViz` minimal and additive;
existing callers must behave exactly as before, and the existing viz tests
must still pass unchanged.

Payloads come from `fetchBlock` in `lib/data.ts`. Prefetch the next pair
during the reveal so `NEXT PAIR` is instant.

## Share artifact

On run end, compose a card via the existing `lib/share` module (extend it;
do not build a second renderer): the two final skylines side by side, the
streak number as the dominant figure in Barlow Condensed, `THE ASSESSOR'S
GAME` wordmark, and the seed printed small so the run is reproducible.
Copy actions match the rest of the app: Web Share with the image file on
mobile, clipboard on desktop, download fallback. Stamp id format
`PD-GAME-{seed}`.

## States and edges

- Loading a pair: the existing `LoadingState` shell, `DEALING THE ROLL…`.
- A payload fetch fails: skip that pair and draw another; two consecutive
  failures show `NetworkErrorState` with a retry that resumes the run.
- Reduced motion: no count-up animation, values appear immediately.
- Mobile: blocks stack vertically, each canvas `clamp(240px, 34svh, 360px)`,
  tap targets ≥44px, the whole run playable without horizontal scroll and
  without trapping page scroll.
- a11y: the two choices are real `<button>`s with accessible names
  (`Left block, Manhattan` / `Right block, Brooklyn`), the reveal is
  announced in a live region, keyboard `←`/`→` pick a side and `Enter`
  advances.

## Entry points

A link in the landing page nav next to the register, labeled `THE
ASSESSOR'S GAME`, with a one-line dry description.

## Acceptance
- `cd apps/web && npm run build && npm test` green; existing tests unchanged.
- New unit tests: the PRNG is deterministic for a seed; pair selection
  respects the ratio band, the taxable filter, and no-repeat; the difficulty
  ramp narrows the band as streak grows.
- New Playwright spec: `/game?seed=test` loads two canvases with no value
  text visible, clicking a side reveals both values and updates the streak,
  `NEXT PAIR` advances, and reloading the same seed yields the same first
  pair.
- `grep -ri "block worth" apps/` empty; no AI attribution; no hard-coded
  citywide stat literals.

## Boundaries
Own: `apps/web/app/game/**`, `apps/web/components/AssessorsGame.tsx` and
helpers, `apps/web/lib/game.ts`, an additive blind-mode prop on `BlockViz`,
an additive card composer in `lib/share/`, and one nav link on the landing
page. Do not restructure `lib/viz/**`, the ETL, or the existing share
composition. Do not commit.
