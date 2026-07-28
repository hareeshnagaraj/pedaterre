# pedaterre — taste bar

The law for design and copy review. Per the Tavisi brand-review routine
(`tavisi-brand-review-routine`): **the bar is law.** Every cited violation
must quote a clause from this file verbatim. Un-anchored opinion is not a
violation — it goes in "to be better" and stays advisory. Research and
precedent may support a citation but can never be the citation.

Extend this file when a new tell is identified. Do not maintain a separate
blacklist; blacklists chase shapes, a bar generalizes.

---

## GOAL

A municipal record that someone made beautiful without making it friendly.
It should read as though the Department of Finance employed one person with
taste, and this is what they shipped. Authority first, charm second, never
salesmanship.

The test: a data journalist screenshots it and nobody in the replies says
"AI made this."

## PEER SET

The bar is drawn from work that is dense, authoritative, and unbranded in
tone: WPA and mid-century municipal print, Vignelli's NYC transit
standards manual, Financial Times and Bloomberg Graphics, the Pudding,
Tufte's plates. What these share: information density is the aesthetic,
the type does the work, decoration is absent rather than restrained.

Explicitly NOT the peer set: startup landing pages, SaaS marketing sites,
crypto dashboards, "data storytelling" microsites with scroll effects.

## PRIORITIZE (ranked — top item wins conflicts)

1. **Every element carries information.** If removing it loses no fact, it
   was decoration and should already be gone.
2. **The number is the hero.** Figures are the largest, most confident
   thing on any surface. Type supports the number; the number never
   supports the type.
3. **State a fact, not a feeling.** Copy reports what is true. It does not
   editorialize about its own tone, method, or virtue.
4. **Density over breathing room.** Where the roll has detail, show it. A
   sparse page is a page that is hiding work.
5. **The dry register.** Deadpan, specific, unhurried. Humor arrives only
   as an observation about a real number, never as a joke.
6. **Restraint in effects.** No bloom, no glow, no particles, no gradient
   as ornament. Material and light only where they clarify form.

## AVOID (violations — cite these verbatim)

**A1 · The eyebrow.** A small all-caps sans label stacked above a larger
headline, where the label restates or categorizes the headline. This is the
single most recognizable AI-frontend tell. A line above a headline is
permitted **only** when it carries information absent from the headline —
a figure, a date, a count. `SOURCES & VERIFICATION` above a sources
heading is a violation. `28,798 blocks · $1.9 trillion assessed` is not.
> Identified by Pranava Raparla, 2026-07-28: "The 'eye brows' (small
> heading in all caps in that sans font above a larger tagline)."

**A2 · "The thing I did, done adverb."** A headline built as a noun phrase
followed by a past participle and an adverb. "Filed values, named plainly."
"Data, presented honestly." "Records, rendered clearly." The construction
describes the writing instead of making a claim, and it is a tell.
> Identified by Pranava Raparla, 2026-07-28: "'The thing I did, done
> adverb'".

**A3 · Self-describing copy.** Any sentence whose subject is the product's
own method, tone, or integrity. The sources page proves rigor by listing
sources, not by calling itself rigorous.

**A4 · Symmetrical feature triads.** Three (or four) equal cards in a row,
each with a label and a short description, used to summarize. If a set is
genuinely a set, it is a table or a list.

**A5 · Decorative section rhythm.** Every section opening with the same
label/headline/subhead scaffold regardless of what the section contains.
Sections earn their own shape from their content.

**A6 · Ornament.** Icons in circles, blobs, wavy dividers, emoji as
design elements, uniform large border-radius, colored left-borders on
cards, purple/indigo gradients, centered-everything layouts.

**A7 · Marketing verbs.** "Unlock," "discover," "explore," "dive into,"
"powerful," "seamless," "beautiful." Also any imperative that flatters the
user rather than instructing them.

**A8 · Default typography.** `system-ui` or `-apple-system` as a display
or body face. The two faces are Barlow Condensed and Libre Franklin.

**A9 · Unsourced figures.** Any number on any surface that cannot be
traced to a filed record or a documented derivation. A modelled or
estimated figure is a violation regardless of how reasonable the model is.

---

## PERMITTED BY EXCEPTION

**E1 · Illustrative building form.** The isometric massing may render
architectural detail that no record supplies — floor divisions, setbacks,
window grids, lit panes. This is the ratified craft of the design mock and
it is what separates the drawing from a bar chart.

The exception is narrow and comes with a duty. **Only height and area
encode a filed figure. Everything else about a building's form is
illustration and must be labelled as such on any surface that renders it.**
A viewer must never be able to mistake a window count, a floor count, or a
setback for data. Extending the encoding — colouring windows by tax class,
sizing setbacks by exemption — voids this exception and becomes an A9
violation, because the viewer would then be reading meaning that is not
there.

Ruled 2026-07-28 after a cross-model lens cited PRIORITIZE 1 against the
massing and recommended stripping it to plain cuboids. Rejected: the bar's
own A9 permits documented derivation, and the fix for undisclosed
illustration is disclosure, not deletion.

---

## METHOD (inherited from `tavisi-brand-review-routine`)

- **Ground-truth verification is mandatory.** Open the source and measure.
  Do not eyeball, do not infer from a screenshot alone. Count the
  instances, read the CSS, check the rendered size.
- **Panel, then moderator.** Independent lenses in parallel, then a
  moderator who reconciles claims against measurements and kills
  hallucinations. The first run of the brand routine had a panel invent a
  violation that the moderator caught; assume this recurs.
- **Citation or it doesn't count.** See the header of this file.
- **Stop for the founder.** The review emits a verdict and a prioritized
  list. It does not decide taste questions unilaterally.
