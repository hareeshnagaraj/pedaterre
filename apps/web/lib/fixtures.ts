import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { blockPayloadSchema, type BlockPayload } from "./schema";

export const fixtureNames = [
  "bpc-16",
  "centralpark-1111",
  "median-si-245",
  "midtown-1398",
  "tail-si-2450",
  "zero-mn-213",
] as const;

export type FixtureName = (typeof fixtureNames)[number];

export function isFixtureName(name: string): name is FixtureName {
  return fixtureNames.includes(name as FixtureName);
}

export async function getFixture(name: FixtureName): Promise<BlockPayload> {
  const fixturePath = path.resolve(
    process.cwd(),
    "../../data/fixtures",
    `${name}.json`,
  );
  const source = await readFile(fixturePath, "utf8");
  return blockPayloadSchema.parse(JSON.parse(source));
}
