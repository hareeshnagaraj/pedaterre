import assert from "node:assert/strict";
import test from "node:test";
import {
  autocompleteAddress,
  parseBbl,
  searchAddress,
} from "../lib/geosearch.ts";

test("parses canonical and compact BBLs and strips URL-leading zeroes", () => {
  assert.deepEqual(parseBbl("1-01398-0021"), {
    boro: 1,
    block: 1398,
    lot: 21,
    canonical: "1-01398-0021",
  });
  assert.deepEqual(parseBbl("1013981010"), {
    boro: 1,
    block: 1398,
    lot: 1010,
    canonical: "1-01398-1010",
  });
  assert.equal(parseBbl("6-01398-0021"), null);
  assert.equal(parseBbl("101398021"), null);
});

test("uses GeoSearch v2 autocomplete and exposes only display-safe labels", async () => {
  let requested = "";
  const suggestions = await autocompleteAddress("41-53 Fulton St", {
    fetcher: async (input) => {
      requested = String(input);
      return new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                gid: "nyc:address:1",
                label: "41-53 Fulton Street, Manhattan, NY",
              },
            },
            { properties: { label: "" } },
          ],
        }),
      );
    },
  });
  assert.match(requested, /\/v2\/autocomplete\?text=41-53\+Fulton\+St$/);
  assert.deepEqual(suggestions, [
    {
      id: "nyc:address:1",
      label: "41-53 Fulton Street, Manhattan, NY",
    },
  ]);
});

test("extracts the nested PAD BBL from a v2 search response", async () => {
  let requested = "";
  const result = await searchAddress("41-53 Fulton St", {
    fetcher: async (input) => {
      requested = String(input);
      return new Response(
        JSON.stringify({
          features: [
            { properties: { label: "Place without PAD data" } },
            {
              properties: {
                addendum: { pad: { bbl: "1000770001" } },
              },
            },
          ],
        }),
      );
    },
  });
  assert.match(requested, /\/v2\/search\?text=41-53\+Fulton\+St$/);
  assert.deepEqual(result, {
    boro: 1,
    block: 77,
    lot: 1,
    canonical: "1-00077-0001",
  });
});

test("an absent PAD addendum follows the empty-state path", async () => {
  assert.equal(
    await searchAddress("Unassigned place", {
      fetcher: async () =>
        new Response(
          JSON.stringify({ features: [{ properties: { label: "Place" } }] }),
        ),
    }),
    null,
  );
});

test("raw BBL submission skips GeoSearch entirely", async () => {
  let requested = false;
  const result = await searchAddress("1-01398-1010", {
    fetcher: async () => {
      requested = true;
      throw new Error("must not run");
    },
  });
  assert.equal(requested, false);
  assert.equal(result?.lot, 1010);
});
