# pedaterre

**NYC tax block assessed value, visualized.**

Look up an address → see the tax block’s DOF-assessed market value, city rank, isometric skyline (height ∝ value), thermal treemap (area ∝ value), and a share card. Not sale prices. Not Zestimates. Assessment roll only.

## Status

- **Product name:** pedaterre (locked)
- **Design mock:** polished interactive HTML in `design/`
- **Production app:** build from [`HANDOFF.md`](./HANDOFF.md) — one-shot execution plan for implementers

## Design lab (reference)

```bash
cd design
# open block-worth-mock.html (to be renamed pedaterre) in a browser
# or deploy design/ on Vercel
```

Live design lab (if still deployed): https://design-livid.vercel.app/block-worth-mock.html

## Sources

NYC Department of Finance property assessment roll + NYC Open Data.  
See [`design/SOURCES.md`](./design/SOURCES.md) and the Sources section in the mock.

## For implementers

**Read [`HANDOFF.md`](./HANDOFF.md) first.** It contains:

- Locked product decisions and non-goals  
- Design tokens and craft rules  
- Data model, ETL, verification  
- Phase-by-phase one-shot build plan  
- Acceptance criteria  

Do not re-ideate the product. Execute the handoff.

## License

TBD
