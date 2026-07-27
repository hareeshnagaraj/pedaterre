import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { blockPayloadSchema } from "../lib/schema.ts";
import { searchAddress } from "../lib/geosearch.ts";
import { selectAddressedGroup } from "../lib/selection.ts";

const matrix = [
  { query: "41-53 Fulton St, New York, NY", boro: 1, kind: "range" },
  { query: "200 E 66th St, New York, NY", boro: 1, kind: "condo" },
  { query: "851 Grand Concourse, Bronx, NY", boro: 2 },
  { query: "1 East 161st Street, Bronx, NY", boro: 2 },
  { query: "347 Jefferson St, Brooklyn, NY", boro: 3 },
  { query: "1 Metrotech Center, Brooklyn, NY", boro: 3 },
  { query: "31-00 47th Avenue, Queens, NY", boro: 4, kind: "hyphenated" },
  { query: "120-55 Queens Boulevard, Queens, NY", boro: 4 },
  { query: "130 Stuyvesant Place, Staten Island, NY", boro: 5 },
  { query: "5-00245-0040", boro: 5, kind: "raw-bbl" },
] as const;

// Live API: pace requests and retry once — GeoSearch p95 is multi-second
// and bursts get throttled; a transient timeout is not a product failure.
async function searchWithRetry(query: string) {
  try {
    return await searchAddress(query, { timeoutMs: 15_000 });
  } catch {
    await new Promise((r) => setTimeout(r, 3_000));
    return searchAddress(query, { timeoutMs: 15_000 });
  }
}

for (const item of matrix) {
  await new Promise((r) => setTimeout(r, 1_500));
  const bbl = await searchWithRetry(item.query);
  assert.ok(bbl, `${item.query}: GeoSearch returned no PAD BBL`);
  assert.equal(bbl.boro, item.boro, `${item.query}: wrong borough`);

  const bucketPath = path.join(
    process.cwd(),
    "public/data/buckets",
    String(bbl.boro),
    `${Math.floor(bbl.block / 10)}.json`,
  );
  const bucket = JSON.parse(await readFile(bucketPath, "utf8"));
  const payload = blockPayloadSchema.parse(bucket[String(bbl.block)]);
  const selection = selectAddressedGroup(payload, bbl.lot);
  assert.equal(
    selection.partial,
    false,
    `${item.query}: lot ${bbl.lot} is absent from the live block payload`,
  );
  assert.ok(
    (selection.addressedGroup?.v ?? 0) > 0,
    `${item.query}: addressed group has no assessed value`,
  );
  process.stdout.write(
    `${item.query} -> /b/${bbl.boro}/${bbl.block}?lot=${bbl.lot}\n`,
  );
}
