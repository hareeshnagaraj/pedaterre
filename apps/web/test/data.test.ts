import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  BlockDataError,
  blockBucketPath,
  clearBlockCache,
  fetchBlock,
} from "../lib/data.ts";

const fixture = JSON.parse(
  await readFile(
    path.resolve(process.cwd(), "../../data/fixtures/midtown-1398.json"),
    "utf8",
  ),
);

test("builds numeric bucket paths from either borough representation", () => {
  assert.equal(blockBucketPath("1", 1398), "/data/buckets/1/139.json");
  assert.equal(blockBucketPath("MN", 1398), "/data/buckets/1/139.json");
  assert.equal(blockBucketPath("6", 1398), null);
});

test("loads, parses, selects, and caches a real-schema block bucket", async () => {
  clearBlockCache();
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    return new Response(JSON.stringify({ "1398": fixture }));
  };
  const first = await fetchBlock("MN", 1398, { fetcher });
  const second = await fetchBlock(1, 1398, { fetcher });
  assert.equal(first.block, 1398);
  assert.equal(second, first);
  assert.equal(requests, 1);
});

test("distinguishes missing buckets and keys from network failures", async () => {
  clearBlockCache();
  await assert.rejects(
    fetchBlock("1", 1398, {
      fetcher: async () => new Response(null, { status: 404 }),
    }),
    (error: unknown) =>
      error instanceof BlockDataError && error.code === "BLOCK_MISSING",
  );

  clearBlockCache();
  await assert.rejects(
    fetchBlock("1", 1398, {
      fetcher: async () => new Response(JSON.stringify({})),
    }),
    (error: unknown) =>
      error instanceof BlockDataError && error.code === "BLOCK_MISSING",
  );

  clearBlockCache();
  await assert.rejects(
    fetchBlock("1", 1398, {
      fetcher: async () => {
        throw new TypeError("offline");
      },
    }),
    (error: unknown) =>
      error instanceof BlockDataError && error.code === "NETWORK",
  );
});

test("aborts a block request at the configured timeout", async () => {
  clearBlockCache();
  await assert.rejects(
    fetchBlock("1", 1398, {
      timeoutMs: 5,
      fetcher: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    }),
    (error: unknown) =>
      error instanceof BlockDataError && error.code === "NETWORK",
  );
});
