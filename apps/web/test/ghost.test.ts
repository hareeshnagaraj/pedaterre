import assert from "node:assert/strict";
import test from "node:test";
import type { BlockPayload, Lot } from "../lib/schema.ts";
import {
  builtHeight,
  empireStateEquivalents,
  formatSquareFeet,
  ghostHeight,
  hasGhostMassing,
  permittedHeight,
} from "../lib/viz/ghost.ts";
import { hScale } from "../lib/viz/projection.ts";

const lot: Lot = {
  bbl: "1-00001-0001",
  lot: 1,
  c: 0,
  r: 0,
  v: 20,
  nLots: 1,
  ghost: 1_000_000,
};

test("ghost height uses the skyline scale without inheriting its minimum", () => {
  assert.equal(ghostHeight(0), 0);
  assert.equal(ghostHeight(null), 0);
  assert.equal(
    ghostHeight(1_000_000),
    hScale(1) - hScale(Number.MIN_VALUE),
  );
  assert.equal(permittedHeight(lot), builtHeight(lot) + ghostHeight(lot.ghost));
  assert.ok(permittedHeight(lot) > builtHeight(lot));
});

test("ghost rendering requires both block and per-group ETL fields", () => {
  const payload = {
    capacitySqft: 1_000_000,
    lots: [lot],
  } as BlockPayload;

  assert.equal(hasGhostMassing(payload), true);
  assert.equal(
    hasGhostMassing({ ...payload, capacitySqft: null }),
    false,
  );
  assert.equal(
    hasGhostMassing({
      ...payload,
      lots: [{ ...lot, ghost: undefined }],
    }),
    false,
  );
});

test("capacity labels and Empire State equivalents stay data-driven", () => {
  assert.equal(formatSquareFeet(1_234_567), "1,234,567 SQ FT");
  assert.equal(empireStateEquivalents(600, 300), 2);
});
