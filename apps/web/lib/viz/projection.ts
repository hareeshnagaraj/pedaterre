import type { Lot } from "../schema";
import type {
  FitState,
  Origin,
  ProjectedPoint,
  ProjectionState,
} from "./types";

export function hScale(v: number) {
  if (v <= 0) return 0;
  // Soft-cap whales; lift mid street so silhouette reads as a city, not one spike
  // Extra mid-band lift ($4–35M) so the skyline isn't flat-then-spike
  const capped = Math.min(v, 220) + Math.log10(v + 1) * 44;
  const midLift = Math.pow(Math.min(v, 40) / 40, 0.55) * 18;
  const lowLift = Math.pow(Math.min(v, 12) / 12, 0.7) * 6;
  return Math.max(11, Math.pow(capped, 0.58) * 5.7 + midLift + lowLift);
}

export function computeOrigin(lots: readonly Lot[]): Origin {
  let sx = 0, sy = 0, n = lots.length || 1;
  lots.forEach((l) => { sx += l.c + 0.31; sy += l.r + 0.31; });
  return { x: sx / n, y: sy / n };
}

/** Project lot-space → screen (uses fit + user zoom) */
export function project(
  x: number,
  y: number,
  z: number,
  state: ProjectionState,
): ProjectedPoint {
  const dx = x - state.origin.x;
  const dy = y - state.origin.y;
  const ca = Math.cos(state.angle), sa = Math.sin(state.angle);
  const ct = Math.cos(state.tilt), st = Math.sin(state.tilt);
  const x1 = dx * ca - dy * sa;
  const y1 = dx * sa + dy * ca;
  const z2 = y1 * st + z * ct;
  const s = 20 * state.fitScale * state.userZoom;
  const w = state.canvasWidth;
  const horizontalScale = Math.max(1, (w / state.canvasHeight) * 1.15);
  return {
    x: w * 0.5 + state.fitPanX + x1 * s * horizontalScale,
    y: state.canvasHeight * 0.5 + state.fitPanY
      + y1 * ct * s
      - z * st * state.userZoom,
    depth: z2 + y1,
    s,
  };
}

/**
 * AABB fit: every building corner at FULL height must land inside
 * the canvas with padding (extra top for labels).
 */
export function recomputeFit(
  lots: readonly Lot[],
  canvasWidth: number,
  canvasHeight: number,
  angle: number,
  tilt: number,
  userZoom: number,
  heightForLot: (lot: Lot) => number = (lot) => hScale(lot.v),
): FitState {
  const origin = computeOrigin(lots);
  let fitScale = 1;
  let fitPanX = 0;
  let fitPanY = 0;
  userZoom = Math.max(userZoom, 0.01);

  const w = canvasWidth || 800;
  const h = canvasHeight;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const base = 0.62;
  const projectionState = (): ProjectionState => ({
    origin,
    fitScale,
    fitPanX,
    fitPanY,
    angle,
    tilt,
    userZoom,
    canvasWidth: w,
    canvasHeight: h,
  });

  lots.forEach((l) => {
    const H = heightForLot(l); // full height for fit (not rise)
    const x0 = l.c, y0 = l.r;
    const pts = [
      [x0, y0, 0], [x0 + base, y0, 0], [x0 + base, y0 + base, 0], [x0, y0 + base, 0],
      [x0, y0, H], [x0 + base, y0, H], [x0 + base, y0 + base, H], [x0, y0 + base, H],
    ];
    pts.forEach(([x, y, z]) => {
      const p = project(x, y, z, projectionState());
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
  });

  // label headroom (YOU combined plate) + iso-hud strip
  minY -= 40;
  maxY += 42;

  const bw = Math.max(40, maxX - minX);
  const bh = Math.max(40, maxY - minY);
  // 12% pad each side → 76% usable
  const pad = 0.76;
  fitScale = Math.min((w * pad) / bw, (h * pad) / bh);
  fitScale = Math.max(0.15, Math.min(fitScale, 4));

  // re-project with new scale, then pan to center
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
  lots.forEach((l) => {
    const H = heightForLot(l);
    const x0 = l.c, y0 = l.r;
    [[x0, y0, 0], [x0 + base, y0, 0], [x0 + base, y0 + base, 0], [x0, y0 + base, 0],
     [x0, y0, H], [x0 + base, y0, H], [x0 + base, y0 + base, H], [x0, y0 + base, H]
    ].forEach(([x, y, z]) => {
      const p = project(x, y, z, projectionState());
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
  });
  minY -= 40;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  fitPanX += w * 0.5 - cx;
  fitPanY += h * 0.54 - cy; // optical bias down (sky / labels above)
  return { origin, fitScale, fitPanX, fitPanY };
}
