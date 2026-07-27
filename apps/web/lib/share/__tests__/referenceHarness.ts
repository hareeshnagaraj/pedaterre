import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { composeCard } from "../composeCard.ts";
import type { ShareCardPayload } from "../cardModel.ts";
import { drawSkylineThumb } from "../thumbAdapter.ts";
import { RasterCanvas } from "./rasterCanvas.ts";

export const REFERENCE_FIXTURES = [
  "midtown-1398",
  "median-si-245",
  "centralpark-1111",
] as const;

const workspaceRoot = fileURLToPath(
  new URL("../../../../../", import.meta.url),
);

export function fixturePath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../../data/fixtures/${name}.json`, import.meta.url),
  );
}

export function referencePath(name: string): string {
  return fileURLToPath(new URL(`../__refs__/${name}.png`, import.meta.url));
}

export async function fixture(name: string): Promise<ShareCardPayload> {
  return JSON.parse(
    await readFile(fixturePath(name), "utf8"),
  ) as ShareCardPayload;
}

export const drawDeterministicSkyline = drawSkylineThumb;

export async function renderReference(name: string): Promise<RasterCanvas> {
  const canvas = new RasterCanvas();
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      fonts: { ready: Promise.resolve() },
      createElement: (tag: string) => {
        if (tag !== "canvas") throw new Error(`Unexpected element ${tag}.`);
        return canvas;
      },
    },
  });

  try {
    await composeCard(await fixture(name), drawSkylineThumb);
    return canvas;
  } finally {
    if (previousDocument === undefined)
      delete (globalThis as { document?: Document }).document;
    else
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
  }
}

export { workspaceRoot };
