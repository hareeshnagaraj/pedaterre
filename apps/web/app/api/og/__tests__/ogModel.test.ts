import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  bucketUrl,
  loadBlockForOg,
  loadRollYearForOg,
  pickBlockFromBucket,
  silhouetteBars,
  topGroupValues,
} from "../[boro]/[block]/ogModel.ts";

const payload = {
  borough: "MN",
  block: 1398,
  totalMv: 593_156_996,
  character: "spread" as const,
  rollYear: "TEST ROLL",
  lots: Array.from({ length: 14 }, (_, index) => ({
    lot: index + 1,
    v: index,
  })),
};

test("builds the same-origin bucket URL using floor(block / 10)", () => {
  assert.equal(
    bucketUrl("https://pedaterre.example/some/path", "mn", 1398),
    "https://pedaterre.example/data/buckets/1/139.json",
  );
});

test("picks the requested block from the keyed bucket", () => {
  assert.equal(pickBlockFromBucket({ "1398": payload }, "MN", 1398), payload);
  assert.equal(pickBlockFromBucket({ "1398": payload }, "BK", 1398), null);
  assert.equal(pickBlockFromBucket({ "1398": payload }, "MN", 1399), null);
});

test("derives a bounded top-12 silhouette from group values", () => {
  const values = topGroupValues(payload);
  assert.deepEqual(values, [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const bars = silhouetteBars(values, 560, 430);
  assert.equal(bars.length, 12);
  assert.ok(bars.every((bar) => bar.x >= 0 && bar.y >= 0 && bar.height <= 430));
  assert.ok(bars[0].height > bars.at(-1)!.height);
});

test("self-fetches the bucket and returns its matching block", async () => {
  let requested = "";
  const fetcher = async (input: string | URL | Request) => {
    requested = String(input);
    return new Response(JSON.stringify({ "1398": payload }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const result = await loadBlockForOg(
    "https://pedaterre.example",
    "MN",
    1398,
    fetcher,
  );
  assert.equal(requested, "https://pedaterre.example/data/buckets/1/139.json");
  assert.deepEqual(result, payload);
});

test("converts fetch and not-found failures into the generic-card path", async () => {
  const missing = await loadBlockForOg(
    "https://pedaterre.example",
    "MN",
    1398,
    async () => new Response(null, { status: 404 }),
  );
  const failed = await loadBlockForOg(
    "https://pedaterre.example",
    "MN",
    1398,
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(missing, null);
  assert.equal(failed, null);
});

test("loads the filed roll year for a missing-record notice", async () => {
  let requested = "";
  const rollYear = await loadRollYearForOg(
    "https://pedaterre.example/some/path",
    async (input) => {
      requested = String(input);
      return new Response(JSON.stringify({ rollYear: "TEST ROLL" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  assert.equal(
    requested,
    "https://pedaterre.example/data/city-stats.json",
  );
  assert.equal(rollYear, "TEST ROLL");
});

test("the route declares its edge image response and immutable cache contract", async () => {
  const routePath = fileURLToPath(
    new URL("../[boro]/[block]/route.tsx", import.meta.url),
  );
  const source = await readFile(routePath, "utf8");
  assert.match(source, /from "@vercel\/og"/);
  assert.match(source, /export const runtime = "edge"/);
  assert.match(source, /public, immutable, max-age=31536000/);
  assert.match(source, /new ImageResponse/);
  assert.match(source, /status: payload \? 200 : 404/);
  assert.match(source, /loadBlockForOg\(new URL\(request\.url\)\.origin/);
  assert.doesNotMatch(source, /\[9, 5, 14, 7, 20, 11, 4, 8\]/);
});
