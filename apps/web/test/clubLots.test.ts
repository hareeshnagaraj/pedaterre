import assert from "node:assert/strict";
import test from "node:test";
import {
  CLUB_LOT_CHUNK_SIZE,
  chunkClubLots,
  clubLotRowsSchema,
  filterClubLots,
} from "../lib/clubLots.ts";

const rows = clubLotRowsSchema.parse([
  {
    bbl: "4001230045",
    boro: 4,
    block: 123,
    lot: 45,
    mv: 90_000_000,
    owner: "CITY OF NEW YORK",
    address: "10 MAIN STREET",
    bldgClass: "O4",
    taxable: false,
    rank: 1,
  },
  {
    bbl: "1011710001",
    boro: 1,
    block: 1171,
    lot: 1,
    mv: 70_000_000,
    owner: "WEST SIDE OWNER LLC",
    address: "400 WEST 61ST STREET",
    bldgClass: "O6",
    taxable: true,
    rank: 2,
  },
  {
    bbl: "1012940002",
    boro: 1,
    block: 1294,
    lot: 2,
    mv: 60_000_000,
    address: "1 EAST 42 STREET",
    bldgClass: "O4",
    taxable: true,
    rank: 2,
  },
]);

test("filters club lots by borough, owner, address, and block scope", () => {
  assert.deepEqual(
    filterClubLots(rows, 1, "").map((row) => row.bbl),
    ["1011710001", "1012940002"],
  );
  assert.deepEqual(
    filterClubLots(rows, "ALL", "west side").map((row) => row.bbl),
    ["1011710001"],
  );
  assert.deepEqual(
    filterClubLots(rows, "ALL", "east 42").map((row) => row.bbl),
    ["1012940002"],
  );
  assert.deepEqual(
    filterClubLots(rows, "ALL", "", { boro: 4, block: 123 }).map(
      (row) => row.bbl,
    ),
    ["4001230045"],
  );
  assert.deepEqual(filterClubLots(rows, 4, "west"), []);
});

test("chunks club lots without changing citywide rank numbers", () => {
  const manyRows = Array.from(
    { length: CLUB_LOT_CHUNK_SIZE + 1 },
    (_, index) => rows[index % rows.length],
  );
  const firstChunk = chunkClubLots(manyRows, CLUB_LOT_CHUNK_SIZE);

  assert.equal(firstChunk.length, CLUB_LOT_CHUNK_SIZE);
  assert.equal(firstChunk[0].rank, 1);
  assert.equal(firstChunk.at(-1)?.rank, 2);
  assert.deepEqual(chunkClubLots(manyRows, -1), []);
});
