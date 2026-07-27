import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpatialHash,
  decodeBlockMap,
  mapBlockQuantiles,
  mapMetricPercentiles,
  parseMapView,
  rankMapBlocks,
  setMapViewSearch,
  spatialCandidates,
} from "../lib/cityMap.ts";

const columns = {
  b: [1, 2],
  k: [1171, 2490],
  x: [31_038, 37_164],
  y: [37_613, 42_548],
  m: [4_335, 31.4],
  a: [4_177_324, 198_000],
  d: [1_037.8, 158.7],
  t: [1, 0],
  r: [5, 500],
};

test("decodes aligned map columns and ranks either measure", () => {
  const blocks = decodeBlockMap(columns);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].block, 1171);
  assert.equal(blocks[0].longitude, -73.98962);
  assert.equal(blocks[0].latitude, 40.77613);
  assert.deepEqual(
    rankMapBlocks(blocks, "density", "ALL").map((block) => block.block),
    [1171, 2490],
  );
  assert.deepEqual(
    rankMapBlocks(blocks, "total", 2).map((block) => block.block),
    [2490],
  );
});

test("the spatial hash resolves candidates from one world cell", () => {
  const blocks = decodeBlockMap(columns);
  const hash = buildSpatialHash(blocks);
  assert.ok(
    spatialCandidates(hash, blocks[0].worldX, blocks[0].worldY).includes(
      blocks[0],
    ),
  );
});

test("rejects misaligned columns and dishonest density nulls", () => {
  assert.throws(() => decodeBlockMap({ ...columns, k: [1171] }), /expected 2/);
  assert.throws(
    () => decodeBlockMap({ ...columns, a: [0, 198_000] }),
    /inconsistent land area and density/,
  );
});

test("maps skewed values to evenly distributed quantile positions per borough", () => {
  const blocks = decodeBlockMap({
    b: [1, 1, 2, 2],
    k: [1, 2, 3, 4],
    x: [30_000, 31_000, 32_000, 33_000],
    y: [35_000, 36_000, 37_000, 38_000],
    m: [1, 2, 10, 100_000],
    a: [100, 100, 100, 100],
    d: [10, 20, 100, 1_000],
    t: [1, 1, 1, 1],
    r: [4, 3, 2, 1],
  });

  const cityQuantiles = mapBlockQuantiles(blocks, "total", "ALL");
  assert.deepEqual(
    blocks.map((block) => cityQuantiles.get(block)),
    [0, 1 / 3, 2 / 3, 1],
  );

  const manhattanQuantiles = mapBlockQuantiles(blocks, "total", 1);
  assert.equal(manhattanQuantiles.size, 2);
  assert.deepEqual(
    blocks.slice(0, 2).map((block) => manhattanQuantiles.get(block)),
    [0, 1],
  );
  assert.equal(manhattanQuantiles.has(blocks[2]), false);

  assert.deepEqual(
    mapMetricPercentiles(blocks, "total", "ALL", [0, 0.5, 1]).map(
      (anchor) => anchor.value,
    ),
    [1, 10, 100_000],
  );
});

test("parses and writes canonical map view search parameters", () => {
  assert.deepEqual(parseMapView("?metric=density&boro=mn"), {
    metric: "density",
    borough: 1,
  });
  assert.deepEqual(parseMapView("?metric=unknown&boro=XX"), {
    metric: "total",
    borough: "ALL",
  });

  const densityQueens = setMapViewSearch(
    new URLSearchParams("b=1&k=995"),
    { metric: "density", borough: 4 },
  );
  assert.equal(densityQueens.get("metric"), "density");
  assert.equal(densityQueens.get("boro"), "QN");
  assert.equal(densityQueens.get("b"), "1");
  assert.equal(densityQueens.get("k"), "995");

  const defaults = setMapViewSearch(densityQueens, {
    metric: "total",
    borough: "ALL",
  });
  assert.equal(defaults.has("metric"), false);
  assert.equal(defaults.has("boro"), false);
});
