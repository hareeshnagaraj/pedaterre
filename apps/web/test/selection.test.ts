import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { blockPayloadSchema } from "../lib/schema.ts";
import { selectAddressedGroup } from "../lib/selection.ts";

const payload = blockPayloadSchema.parse(
  JSON.parse(
    await readFile(
      path.resolve(process.cwd(), "../../data/fixtures/midtown-1398.json"),
      "utf8",
    ),
  ),
);

test("a condo unit and billing lot resolve to the combined non-zero group", () => {
  for (const lot of [1010, 7501]) {
    const selection = selectAddressedGroup(payload, lot);
    assert.equal(selection.partial, false);
    assert.equal(selection.addressedGroup?.lot, 1001);
    assert.equal(selection.addressedGroup?.nLots, 196);
    assert.ok((selection.addressedGroup?.v ?? 0) > 0);
    assert.equal(selection.payload.lots.filter((group) => group.you).length, 1);
  }
});

test("an absent lot is partial and leaves zero YOU claims", () => {
  const selection = selectAddressedGroup(
    {
      ...payload,
      lots: payload.lots.map((lot, index) => ({
        ...lot,
        you: index === 0 || undefined,
      })),
    },
    9999,
  );
  assert.equal(selection.partial, true);
  assert.equal(selection.addressedGroup, null);
  assert.equal(selection.payload.lots.some((group) => group.you), false);
});

test("a block opened without a lot has no partial notice", () => {
  const selection = selectAddressedGroup(payload, null);
  assert.equal(selection.partial, false);
  assert.equal(selection.addressedGroup, null);
});
