import assert from "node:assert/strict";
import test from "node:test";
import { composeGameCard, gameStamp } from "../composeCard.ts";
import { fixture } from "./referenceHarness.ts";

test("the game composer draws two blind skylines and files the seeded stamp", async () => {
  const texts: string[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    fillRect() {},
    strokeRect() {},
    save() {},
    restore() {},
    translate() {},
    fillText(value: string) {
      texts.push(value);
    },
    measureText(value: string) {
      return { width: value.length * 10 };
    },
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    setAttribute() {},
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { fonts: { ready: Promise.resolve() }, createElement: () => canvas },
  });

  try {
    let skylineCount = 0;
    await composeGameCard(
      {
        left: await fixture("midtown-1398"),
        right: await fixture("median-si-245"),
        seed: "test",
        streak: 7,
      },
      (_ctx, payload) => {
        skylineCount += 1;
        assert.equal(payload.lots?.some((lot) => lot.club || lot.you), false);
      },
    );
    assert.equal(skylineCount, 2);
    assert.equal(gameStamp("test"), "PD-GAME-test");
    assert.match(texts.join(" "), /THE ASSESSOR'S GAME/);
    assert.match(texts.join(" "), /PD-GAME-test/);
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
