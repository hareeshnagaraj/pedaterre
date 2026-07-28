import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCK_RANK_CHUNK_SIZE,
  blockRankRowsSchema,
  chunkBlockRanks,
  filterBlockRanks,
} from "../lib/blockRanks.ts";

const rows = blockRankRowsSchema.parse([
  {
    b: 4,
    k: 14260,
    m: 300,
    t: false,
    a: "154 BROOKVILLE BLVD",
    c: "whale",
    rank: 1,
  },
  {
    b: 1,
    k: 1171,
    m: 200,
    t: true,
    a: "400 WEST 61ST STREET",
    c: "spread",
    rank: 2,
  },
  {
    b: 1,
    k: 1294,
    m: 100,
    t: true,
    c: "flat",
    rank: 2,
  },
]);

test("filters ranked rows by borough, block number, and address", () => {
  assert.deepEqual(
    filterBlockRanks(rows, 1, "").map((row) => row.k),
    [1171, 1294],
  );
  assert.deepEqual(
    filterBlockRanks(rows, "ALL", "1426").map((row) => row.k),
    [14260],
  );
  assert.deepEqual(
    filterBlockRanks(rows, "ALL", "west 61st").map((row) => row.k),
    [1171],
  );
  assert.deepEqual(filterBlockRanks(rows, 4, "west"), []);
});

test("chunks without changing citywide rank numbers", () => {
  const manyRows = Array.from(
    { length: BLOCK_RANK_CHUNK_SIZE + 1 },
    (_, index) => rows[index % rows.length],
  );
  const firstChunk = chunkBlockRanks(manyRows, BLOCK_RANK_CHUNK_SIZE);

  assert.equal(firstChunk.length, BLOCK_RANK_CHUNK_SIZE);
  assert.equal(firstChunk[0].rank, 1);
  assert.equal(firstChunk.at(-1)?.rank, 2);
  assert.deepEqual(chunkBlockRanks(manyRows, -1), []);
});
