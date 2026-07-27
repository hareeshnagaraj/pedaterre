import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildShareCardModel,
  stampFor,
  type ShareCardPayload,
} from "../cardModel.ts";
import { CARD_HEIGHT, CARD_WIDTH, composeCard } from "../composeCard.ts";
import { decodePng, RasterCanvas } from "./rasterCanvas.ts";
import {
  REFERENCE_FIXTURES,
  drawDeterministicSkyline,
  fixture,
  referencePath,
  renderReference,
} from "./referenceHarness.ts";

test("builds the receipt model with dry labels and a deterministic stamp", async () => {
  const payload = await fixture("midtown-1398");
  payload.address = "200 E 66th St";
  payload.addressedLot = { lot: 60, valueM: 43.17 };
  payload.rank = 2418;

  const model = buildShareCardModel(payload);
  assert.equal(model.stamp, "PD-MN-1398-FY27");
  assert.equal(model.addressedLot, "LOT 60 · $43.2M");
  assert.match(model.where, /200 E 66th St · MN Block 1398/);
  assert.ok(model.quip.length > 0);
  assert.equal(
    model.source,
    "DOF assessed market value · not sale price · nyc.gov/finance",
  );
});

test("omits the addressed-lot row in the partial variant", async () => {
  const model = buildShareCardModel(await fixture("median-si-245"));
  assert.equal(model.addressedLot, null);
  assert.equal(model.stamp, stampFor({ borough: "SI", block: 245 }));
});

test("uses the required zero-value copy", async () => {
  const payload: ShareCardPayload = {
    borough: "MN",
    block: 213,
    totalMv: 0,
    character: "empty",
    nLots: 1,
    nGroups: 1,
    lots: [{ lot: 1, v: 0 }],
  };
  assert.equal(buildShareCardModel(payload).dollars, "assessed at $0");
});

test("waits for document.fonts.ready before drawing", async () => {
  let releaseFonts!: () => void;
  let drew = false;
  const canvas = new RasterCanvas();
  const ready = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      fonts: { ready },
      createElement: () => canvas,
    },
  });

  try {
    const rendering = composeCard(await fixture("median-si-245"), () => {
      drew = true;
    });
    await Promise.resolve();
    assert.equal(drew, false);
    releaseFonts();
    await rendering;
    assert.equal(drew, true);
    assert.equal(canvas.width, CARD_WIDTH);
    assert.equal(canvas.height, CARD_HEIGHT);
  } finally {
    if (previousDocument === undefined)
      delete (globalThis as { document?: Document }).document;
    else
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
  }
});

for (const name of REFERENCE_FIXTURES) {
  test(`matches the ${name} reference within one percent`, async () => {
    const actual = await renderReference(name);
    const expected = decodePng(await readFile(referencePath(name)));
    assert.equal(expected.width, CARD_WIDTH);
    assert.equal(expected.height, CARD_HEIGHT);

    let differingPixels = 0;
    for (let pixel = 0; pixel < expected.width * expected.height; pixel += 1) {
      const offset = pixel * 4;
      const differs =
        Math.abs(expected.pixels[offset] - actual.pixels[offset]) > 2 ||
        Math.abs(expected.pixels[offset + 1] - actual.pixels[offset + 1]) > 2 ||
        Math.abs(expected.pixels[offset + 2] - actual.pixels[offset + 2]) > 2 ||
        Math.abs(expected.pixels[offset + 3] - actual.pixels[offset + 3]) > 2;
      if (differs) differingPixels += 1;
    }

    const differenceRatio =
      differingPixels / (expected.width * expected.height);
    assert.ok(
      differenceRatio <= 0.01,
      `${(differenceRatio * 100).toFixed(3)}% of pixels differ`,
    );
  });
}

test("the exported composition contains no controls", async () => {
  const canvas = await renderReference("centralpark-1111");
  const text = canvas.getContext("2d")?.texts.join(" ") ?? "";
  assert.doesNotMatch(text, /copy|share|button/i);
  assert.match(text, /pedaterre/);
});

test("the deterministic skyline callback is accepted directly", async () => {
  const canvas = new RasterCanvas();
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { fonts: { ready: Promise.resolve() }, createElement: () => canvas },
  });
  try {
    await composeCard(await fixture("midtown-1398"), drawDeterministicSkyline);
    assert.equal(canvas.width, 1200);
  } finally {
    if (previousDocument === undefined)
      delete (globalThis as { document?: Document }).document;
    else
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
  }
});
