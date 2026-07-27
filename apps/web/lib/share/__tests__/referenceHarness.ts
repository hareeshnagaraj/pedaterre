import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { composeCard, type DrawSkylineThumb } from "../composeCard.ts";
import type { ShareCardPayload } from "../cardModel.ts";
import { RasterCanvas, type RasterContext } from "./rasterCanvas.ts";

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

export const drawDeterministicSkyline: DrawSkylineThumb = (
  context,
  payload,
  width,
  height,
) => {
  const ctx = context as unknown as RasterContext;
  ctx.fillStyle = "#171411";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#8f877c";
  ctx.fillRect(44, height - 70, width - 88, 2);

  const values = (payload.lots ?? [])
    .map((lot) => lot.v)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => b - a)
    .slice(0, 12);
  const maximum = Math.max(...values, 1);
  const gap = 9;
  const barWidth =
    (width - 88 - gap * Math.max(0, values.length - 1)) /
    Math.max(1, values.length);

  values.forEach((value, index) => {
    const barHeight = 28 + Math.sqrt(value / maximum) * (height - 168);
    ctx.fillStyle = index === 0 ? "#e0b04a" : "#5a544c";
    ctx.fillRect(
      44 + index * (barWidth + gap),
      height - 70 - barHeight,
      barWidth,
      barHeight,
    );
  });
};

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
    await composeCard(await fixture(name), drawDeterministicSkyline);
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
