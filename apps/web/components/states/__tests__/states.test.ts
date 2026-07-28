import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const statesDirectory = fileURLToPath(new URL("../", import.meta.url));

async function source(file: string): Promise<string> {
  return readFile(new URL(`../${file}`, import.meta.url), "utf8");
}

const STATE_FILES = [
  "LoadingState.tsx",
  "EmptyState.tsx",
  "SearchErrorState.tsx",
  "BlockMissingState.tsx",
  "NetworkErrorState.tsx",
  "PartialNotice.tsx",
  "DegradedState.tsx",
] as const;

test("all seven states export a focus target and a live region", async () => {
  for (const file of STATE_FILES) {
    const text = await source(file);
    assert.match(
      text,
      /export const focusRef = createRef</,
      `${file} must export focusRef`,
    );
    assert.match(
      text,
      /StateFrame|aria-live=/,
      `${file} must provide a live region`,
    );
  }
});

test("contains the binding municipal copy", async () => {
  const combined = (await Promise.all(STATE_FILES.map(source))).join("\n");
  for (const phrase of [
    "PULLING THE ROLL…",
    "NO NYC ADDRESS MATCH",
    "SEARCH UNAVAILABLE",
    "NO PARCEL ON FILE — this block is not in the ",
    "RETRY",
    "THE REQUESTED LOT IS NOT ON THIS ROLL — showing the full block",
    "CANVAS UNAVAILABLE",
  ]) {
    assert.ok(combined.includes(phrase), `missing copy: ${phrase}`);
  }
});

test("loading keeps the submitted address, aria-busy, and a disabled resubmit", async () => {
  const text = await source("LoadingState.tsx");
  assert.match(text, /submittedAddress/);
  assert.match(text, /<header/);
  assert.doesNotMatch(text, /styles\.(?:silhouette|tower)/);
  assert.match(text, /busy/);
  assert.match(text, /disabled/);
  assert.match(text, /slowAfterMs = 4_000/);
  assert.match(text, /numericFallback/);
  assert.doesNotMatch(text, /spinner/i);
});

test("partial notice contains no addressed-property claim", async () => {
  const text = await source("PartialNotice.tsx");
  assert.doesNotMatch(text, /\bYOU(R)?\b/);
});

test("degraded state provides the numeric card and an accessible table", async () => {
  const text = await source("DegradedState.tsx");
  assert.match(text, /numericCard/);
  assert.match(text, /<table/);
  assert.match(text, /<caption>/);
  assert.match(text, /<th scope="row">/);
});

test("controls meet the 44px target and CSS colors are token-bound", async () => {
  const css = await source("states.module.css");
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/i);
  assert.match(css, /var\(--stamp\)/);
  assert.match(css, /var\(--focus\)/);
});

test("the dev page renders all seven state components", async () => {
  const text = await source("StatesDevPage.tsx");
  for (const component of [
    "LoadingState",
    "EmptyState",
    "SearchErrorState",
    "BlockMissingState",
    "NetworkErrorState",
    "PartialNotice",
    "DegradedState",
  ]) {
    assert.match(text, new RegExp(`<${component}\\b`));
  }
});

test("owned files contain no retired product name", async () => {
  const retiredName = new RegExp(["block", "worth"].join(" "), "i");
  const files = await readdir(statesDirectory, { recursive: true });
  for (const file of files) {
    if (typeof file !== "string" || !/\.(?:ts|tsx|css)$/.test(file)) continue;
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, retiredName, file);
  }
});
