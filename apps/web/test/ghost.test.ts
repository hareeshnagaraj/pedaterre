import assert from "node:assert/strict";
import test from "node:test";
import type { BlockPayload, Lot } from "../lib/schema.ts";
import {
  builtHeight,
  empireStateEquivalents,
  formatSquareFeet,
  ghostHeight,
  hasGhostMassing,
  medianBuiltHeight,
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
  builtSqft: 2_000_000,
  ghost: 1_000_000,
};

test("ghost height uses built area and clamps the permitted ratio", () => {
  const medianHeight = medianBuiltHeight([lot]);
  assert.equal(ghostHeight({ ...lot, ghost: 0 }, medianHeight), 0);
  assert.equal(ghostHeight({ ...lot, ghost: null }, medianHeight), 0);
  assert.equal(ghostHeight(lot, medianHeight), builtHeight(lot) * 0.5);
  assert.ok(ghostHeight(lot, medianHeight) > 0);

  const clamped = { ...lot, builtSqft: 1, ghost: 10_000_000 };
  assert.equal(ghostHeight(clamped, medianHeight), builtHeight(lot) * 3);
  assert.equal(
    permittedHeight(lot, medianHeight),
    builtHeight(lot) + ghostHeight(lot, medianHeight),
  );
});

test("vacant capacity falls back to half the block median height", () => {
  const medianHeight = hScale(20);
  const vacant = { ...lot, v: 0, builtSqft: 0, ghost: 100_000 };
  assert.equal(builtHeight(vacant), 0);
  assert.equal(ghostHeight(vacant, medianHeight), medianHeight * 0.5);
  assert.ok(permittedHeight(vacant, medianHeight) > 0);
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
