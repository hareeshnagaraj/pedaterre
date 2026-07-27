import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { blockPayloadSchema } from "../lib/schema.ts";

const fixtureNames = [
  "bpc-16",
  "centralpark-1111",
  "median-si-245",
  "midtown-1398",
  "tail-si-2450",
  "zero-mn-213",
];

test("the schema parses all six golden fixtures", async () => {
  const fixtureDirectory = path.resolve(process.cwd(), "../../data/fixtures");

  for (const name of fixtureNames) {
    const source = await readFile(path.join(fixtureDirectory, `${name}.json`), "utf8");
    const result = blockPayloadSchema.safeParse(JSON.parse(source));
    assert.equal(
      result.success,
      true,
      result.success ? undefined : `${name}: ${result.error.message}`,
    );
  }
});

test("the all-zero fixture keeps its nullable share and zero-value marker", async () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "../../data/fixtures/zero-mn-213.json",
  );
  const payload = blockPayloadSchema.parse(
    JSON.parse(await readFile(fixturePath, "utf8")),
  );

  assert.equal(payload.largestGroupShare, null);
  assert.equal(payload.lots[0].zero, true);
  assert.equal(payload.lots[0].v, 0);
});
