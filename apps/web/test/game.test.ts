import assert from "node:assert/strict";
import test from "node:test";
import type { BlockRankRow } from "../lib/blockRanks.ts";
import {
  createGameRandom,
  difficultyBand,
  gameBlockKey,
  gamePairRatio,
  isGamePayloadEligible,
  selectGamePair,
} from "../lib/game.ts";

function block(
  b: number,
  k: number,
  m: number,
  t = true,
  c: BlockRankRow["c"] = "spread",
): BlockRankRow {
  return { b, k, m, t, c, rank: 1 };
}

test("the seeded xorshift produces the same run for the same seed", () => {
  const first = createGameRandom("test");
  const second = createGameRandom("test");
  assert.deepEqual(
    Array.from({ length: 10 }, () => first()),
    Array.from({ length: 10 }, () => second()),
  );
});

test("pair selection excludes public blocks, honors the band, and skips used blocks", () => {
  const usedBlock = block(1, 2, 800);
  const rows = [
    block(1, 1, 1_000, false, "whale"),
    usedBlock,
    block(1, 3, 400, true, "flat"),
    block(2, 4, 200, true, "whale"),
    block(3, 5, 100),
  ];
  const pair = selectGamePair(
    rows,
    0,
    new Set([gameBlockKey(usedBlock)]),
    () => 0,
  );

  assert.ok(pair);
  assert.equal(pair.left.t, true);
  assert.equal(pair.right.t, true);
  assert.notEqual(gameBlockKey(pair.left), gameBlockKey(usedBlock));
  assert.notEqual(gameBlockKey(pair.right), gameBlockKey(usedBlock));
  assert.equal(gamePairRatio(pair.left, pair.right), pair.ratio);
  assert.ok(pair.ratio >= 1.15 && pair.ratio <= 3);
});

test("pair selection requires different silhouette characters", () => {
  const twoFlatBlocks = [
    block(4, 943, 21_876_000, true, "flat"),
    block(4, 12_215, 18_381_000, true, "flat"),
  ];
  assert.equal(selectGamePair(twoFlatBlocks, 0, new Set(), () => 0), null);

  const distinctPair = selectGamePair(
    [...twoFlatBlocks, block(4, 14_254, 11_487_000, true, "whale")],
    0,
    new Set(),
    () => 0,
  );
  assert.ok(distinctPair);
  assert.notEqual(distinctPair.left.c, distinctPair.right.c);
});

test("the difficulty band narrows to near 1.15 as the streak grows", () => {
  assert.deepEqual(difficultyBand(0), { min: 1.15, max: 3 });
  assert.ok(difficultyBand(5).max < difficultyBand(0).max);
  assert.ok(difficultyBand(10).max < difficultyBand(5).max);
  assert.equal(difficultyBand(10).max, 1.2);
  assert.deepEqual(difficultyBand(40), difficultyBand(10));
});

test("blocks with fewer than three rendered groups are ineligible", () => {
  assert.equal(isGamePayloadEligible({ nGroups: 2 }), false);
  assert.equal(isGamePayloadEligible({ nGroups: 3 }), true);
});
