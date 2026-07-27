import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { BoroughCode } from "./borough";

const blockPickSchema = z.object({
  borough: z.enum(["MN", "BX", "BK", "QN", "SI"]),
  block: z.number().int().nonnegative(),
  totalM: z.number().nonnegative(),
  addressHint: z.string().optional(),
  owner: z.string().optional(),
});

const cityStatsSchema = z.object({
  totalMv: z.number().nonnegative(),
  clubLots: z.number().int().nonnegative(),
  clubShareOfMv: z.number().min(0).max(1),
  nBlocks: z.number().int().positive(),
  nLots: z.number().int().positive(),
  boroughTotals: z.record(z.number().nonnegative()),
  top25Taxable: z.array(blockPickSchema).min(2),
  rollYear: z.string(),
  extractHash: z.string(),
});

const boroughPicksSchema = z.record(blockPickSchema);

export type CityStats = z.infer<typeof cityStatsSchema>;
export type BlockPick = z.infer<typeof blockPickSchema>;

const dataRoot = path.join(process.cwd(), "public/data");
let cityStatsPromise: Promise<CityStats> | undefined;
let boroughPicksPromise: Promise<Record<string, BlockPick>> | undefined;

export function getCityStats(): Promise<CityStats> {
  cityStatsPromise ??= readFile(path.join(dataRoot, "city-stats.json"), "utf8")
    .then(JSON.parse)
    .then((value) => cityStatsSchema.parse(value));
  return cityStatsPromise;
}

export function getBoroughPicks(): Promise<Record<string, BlockPick>> {
  boroughPicksPromise ??= readFile(
    path.join(dataRoot, "borough-picks.json"),
    "utf8",
  )
    .then(JSON.parse)
    .then((value) => boroughPicksSchema.parse(value));
  return boroughPicksPromise;
}

export async function curatedResultLinks(
  currentBorough: BoroughCode,
): Promise<BlockPick[]> {
  const [stats, byBorough] = await Promise.all([
    getCityStats(),
    getBoroughPicks(),
  ]);
  const first = stats.top25Taxable[0];
  const boroughPick =
    stats.top25Taxable.find((pick) => pick.borough === currentBorough) ??
    byBorough[currentBorough] ??
    stats.top25Taxable[1];
  return boroughPick.block === first.block &&
    boroughPick.borough === first.borough
    ? [first, stats.top25Taxable[1]]
    : [first, boroughPick];
}

// Pre-render only the curated set. Vercel caps deployments at 16,000 output
// files; all 28,798 blocks as static pages tripled that. The long tail
// renders on demand (dynamicParams) and is cached after first hit.
export async function curatedBlockRouteParams(): Promise<
  Array<{ boro: string; block: string }>
> {
  const [stats, byBorough] = await Promise.all([
    getCityStats(),
    getBoroughPicks(),
  ]);
  const seen = new Set<string>();
  const output: Array<{ boro: string; block: string }> = [];
  const codeToNumber: Record<string, number> = {
    MN: 1,
    BX: 2,
    BK: 3,
    QN: 4,
    SI: 5,
  };
  const add = (pick: BlockPick) => {
    const boro = String(codeToNumber[pick.borough]);
    const key = `${boro}/${pick.block}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push({ boro, block: String(pick.block) });
    }
  };
  for (const pick of stats.top25Taxable) add(pick);
  for (const pick of Object.values(byBorough)) add(pick);
  return output;
}
