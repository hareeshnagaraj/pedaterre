import assert from "node:assert/strict";
import test from "node:test";
import type { Lot } from "../lib/schema.ts";
import { thermalRampRGB, thermalRGB } from "../lib/viz/color.ts";
import { hScale, project, recomputeFit } from "../lib/viz/projection.ts";
import { layoutTreemap } from "../lib/viz/treemap.ts";

function lot(lotNumber: number, value: number): Lot {
  return {
    bbl: `1-00001-${String(lotNumber).padStart(4, "0")}`,
    lot: lotNumber,
    c: lotNumber - 1,
    r: 0,
    v: value,
    nLots: 1,
  };
}

test("zero and negative values have no building height", () => {
  assert.equal(hScale(0), 0);
  assert.equal(hScale(-1), 0);
  assert.ok(hScale(0.001) > 0);
});

test("the 32% carve returns two districts without cloning lots", () => {
  const lots = [lot(1, 40), lot(2, 24), lot(3, 20), lot(4, 16)];
  const layout = layoutTreemap(lots, 16, 16, 900, 408);

  assert.equal(layout.districts.length, 2);
  assert.equal(layout.cells.length, lots.length);
  for (const cell of layout.cells) {
    assert.ok(lots.includes(cell.lot), "treemap must preserve lot object identity");
  }
});

test("the eight-corner AABB fit keeps full-height buildings finite and framed", () => {
  const lots = [
    { ...lot(1, 524), c: 0, r: 0, club: true },
    { ...lot(2, 18), c: 1, r: 0 },
    { ...lot(3, 8), c: 0, r: 1 },
    { ...lot(4, 5), c: 1, r: 1 },
  ];
  const width = 900;
  const height = 440;
  const angle = -0.72;
  const tilt = 0.58;
  const fit = recomputeFit(lots, width, height, angle, tilt, 1);
  const state = {
    ...fit,
    angle,
    tilt,
    userZoom: 1,
    canvasWidth: width,
    canvasHeight: height,
  };
  const points = lots.flatMap((item) => {
    const base = 0.62;
    const top = hScale(item.v);
    return [
      [item.c, item.r, 0],
      [item.c + base, item.r, 0],
      [item.c + base, item.r + base, 0],
      [item.c, item.r + base, 0],
      [item.c, item.r, top],
      [item.c + base, item.r, top],
      [item.c + base, item.r + base, top],
      [item.c, item.r + base, top],
    ].map(([x, y, z]) => project(x, y, z, state));
  });

  for (const point of points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x > 0 && point.x < width);
    assert.ok(point.y > 0 && point.y < height);
  }
});

test("tower height stays in screen pixels when the footprint fit changes", () => {
  const state = {
    origin: { x: 0, y: 0 },
    fitScale: 1,
    fitPanX: 0,
    fitPanY: 0,
    angle: -0.72,
    tilt: 0.58,
    userZoom: 1,
    canvasWidth: 900,
    canvasHeight: 440,
  };
  const height = hScale(105.809);
  const base = project(0, 0, 0, state);
  const top = project(0, 0, height, state);
  const fittedBase = project(0, 0, 0, { ...state, fitScale: 3 });
  const fittedTop = project(0, 0, height, { ...state, fitScale: 3 });

  assert.equal(base.y - top.y, fittedBase.y - fittedTop.y);
});

test("low-value thermal cells stay on the cool indigo end of the ramp", () => {
  assert.equal(thermalRGB(0, 35).fill, "rgb(16,20,38)");
  assert.equal(thermalRGB(0.577, 35).fill, "rgb(32,73,112)");
  assert.equal(thermalRampRGB(0).fill, "rgb(16,20,38)");
  assert.equal(thermalRampRGB(1).fill, "rgb(220,108,40)");
});
