import type { Lot } from "../schema";
import type {
  ThermalDistrict,
  TreemapCell,
  TreemapLayout,
  TreemapNode,
} from "./types";

export function layoutTreemap(
  items: readonly Lot[],
  x: number,
  y: number,
  w: number,
  h: number,
): TreemapLayout {
  let thermalDistricts: ThermalDistrict[] = [];
  if (!items.length || w < 0.5 || h < 0.5) {
    return { cells: [], districts: thermalDistricts };
  }
  const gap = 4.5; // street gutters — intentional map structure (NNGroup hierarchy)
  const total = items.reduce((s, l) => s + Math.max(l.v, 0.01), 0);
  const sorted = [...items].sort((a, b) => b.v - a.v);
  const topShare = sorted[0].v / total;

  // Extreme skew (e.g. midtown whale): carve primary slab, pack rest as district
  if (sorted.length >= 4 && topShare >= 0.32) {
    const major: Lot[] = [];
    let majorSum = 0;
    for (let i = 0; i < sorted.length; i++) {
      const next = majorSum + sorted[i].v;
      // take consecutive top lots until ~62–75% or 3 slabs — keep rest as neighborhood
      if (i > 0 && (majorSum / total >= 0.55 || major.length >= 3)) break;
      if (i > 0 && sorted[i].v / total < 0.06 && majorSum / total >= 0.4) break;
      major.push(sorted[i]);
      majorSum = next;
    }
    if (major.length && major.length < sorted.length) {
      const rest = sorted.filter((l) => !major.includes(l));
      const majorFrac = majorSum / total;
      const restFrac = 1 - majorFrac;
      const gutter = gap + 3.5; // wider district street
      let majorBox, restBox;
      if (w >= h) {
        // vertical split — major on the left (editorial lead)
        const mw = Math.max(48, (w - gutter) * majorFrac);
        majorBox = { x, y, w: mw, h };
        restBox = { x: x + mw + gutter, y, w: Math.max(8, w - mw - gutter), h };
      } else {
        const mh = Math.max(40, (h - gutter) * majorFrac);
        majorBox = { x, y, w, h: mh };
        restBox = { x, y: y + mh + gutter, w, h: Math.max(8, h - mh - gutter) };
      }
      thermalDistricts = [
        {
          kind: "lead",
          x: majorBox.x - 1.5,
          y: majorBox.y - 1.5,
          w: majorBox.w + 3,
          h: majorBox.h + 3,
          share: majorFrac,
          label: null,
        },
        {
          kind: "rest",
          x: restBox.x - 1.5,
          y: restBox.y - 1.5,
          w: restBox.w + 3,
          h: restBox.h + 3,
          share: restFrac,
          label: "Rest of block",
        },
      ];
      return {
        cells: layoutTreemapFlat(major, majorBox.x, majorBox.y, majorBox.w, majorBox.h, gap).concat(
          layoutTreemapFlat(rest, restBox.x, restBox.y, restBox.w, restBox.h, Math.max(2.5, gap - 0.5))
        ),
        districts: thermalDistricts,
      };
    }
  }
  return {
    cells: layoutTreemapFlat(sorted, x, y, w, h, gap),
    districts: thermalDistricts,
  };
}

export function layoutTreemapFlat(
  items: readonly Lot[],
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): TreemapCell[] {
  if (!items.length || w < 0.5 || h < 0.5) return [];
  const total = items.reduce((s, l) => s + Math.max(l.v, 0.01), 0);
  const scale = (w * h) / total;
  const nodes = items.map((lot) => ({ lot, area: Math.max(lot.v, 0.01) * scale }));
  return squarify(nodes, [], x, y, w, h, gap);
}

export function worstAspect(row: readonly TreemapNode[], side: number) {
  if (!row.length || side <= 0) return Infinity;
  let s = 0, rMax = 0, rMin = Infinity;
  for (let i = 0; i < row.length; i++) {
    const a = row[i].area;
    s += a;
    if (a > rMax) rMax = a;
    if (a < rMin) rMin = a;
  }
  if (s <= 0 || rMin <= 0) return Infinity;
  const s2 = s * s;
  const w2 = side * side;
  return Math.max((w2 * rMax) / s2, s2 / (w2 * rMin));
}

export function layoutRow(
  row: readonly TreemapNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): { rects: TreemapCell[]; x: number; y: number; w: number; h: number } {
  if (!row.length) return { rects: [], x, y, w, h };
  const s = row.reduce((a, n) => a + n.area, 0);
  const rects: TreemapCell[] = [];
  const n = row.length;
  const gaps = Math.max(0, n - 1) * gap;

  if (w >= h) {
    // row fills a vertical strip on the left
    let stripW = Math.max(4, s / h);
    stripW = Math.min(stripW, Math.max(4, w - 4));
    let yy = y;
    const avail = Math.max(1, h - gaps);
    for (let i = 0; i < n; i++) {
      const rh = Math.max(3, (row[i].area / s) * avail);
      rects.push({ lot: row[i].lot, x, y: yy, w: stripW, h: rh });
      yy += rh + gap;
    }
    const used = stripW + (w > stripW + gap ? gap : 0);
    return { rects, x: x + used, y, w: Math.max(0, w - used), h };
  }
  // row fills a horizontal strip on the top
  let stripH = Math.max(4, s / w);
  stripH = Math.min(stripH, Math.max(4, h - 4));
  let xx = x;
  const avail = Math.max(1, w - gaps);
  for (let i = 0; i < n; i++) {
    const rw = Math.max(3, (row[i].area / s) * avail);
    rects.push({ lot: row[i].lot, x: xx, y, w: rw, h: stripH });
    xx += rw + gap;
  }
  const used = stripH + (h > stripH + gap ? gap : 0);
  return { rects, x, y: y + used, w, h: Math.max(0, h - used) };
}

export function squarify(
  children: readonly TreemapNode[],
  row: readonly TreemapNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): TreemapCell[] {
  if (w < 1 || h < 1) {
    // collapse leftovers into remaining box so no lot is dropped
    if (!children.length && !row.length) return [];
    const all = row.concat(children);
    if (all.length === 1) {
      return [{ lot: all[0].lot, x, y, w: Math.max(w, 3), h: Math.max(h, 3) }];
    }
    // fallback slice in leftover sliver
    const total = all.reduce((s, n) => s + n.area, 0) || 1;
    const out: TreemapCell[] = [];
    if (w >= h) {
      let xx = x;
      all.forEach((n) => {
        const rw = Math.max(2, (n.area / total) * w);
        out.push({ lot: n.lot, x: xx, y, w: rw, h: Math.max(h, 3) });
        xx += rw;
      });
    } else {
      let yy = y;
      all.forEach((n) => {
        const rh = Math.max(2, (n.area / total) * h);
        out.push({ lot: n.lot, x, y: yy, w: Math.max(w, 3), h: rh });
        yy += rh;
      });
    }
    return out;
  }

  if (!children.length) {
    return layoutRow(row, x, y, w, h, gap).rects;
  }

  const c = children[0];
  const side = Math.min(w, h);
  const row2 = row.concat([c]);

  if (!row.length || worstAspect(row, side) >= worstAspect(row2, side)) {
    return squarify(children.slice(1), row2, x, y, w, h, gap);
  }
  const laid = layoutRow(row, x, y, w, h, gap);
  return laid.rects.concat(squarify(children, [], laid.x, laid.y, laid.w, laid.h, gap));
}
