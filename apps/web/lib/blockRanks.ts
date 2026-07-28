import { z } from "zod";

export const BLOCK_RANK_CHUNK_SIZE = 200;

const blockRankRowSchema = z
  .object({
    b: z.number().int().min(1).max(5),
    k: z.number().int().min(0).max(99_999),
    m: z.number().int().nonnegative(),
    t: z.boolean(),
    a: z.string().max(28).optional(),
    c: z.enum(["whale", "spread", "flat", "single", "empty"]),
    rank: z.number().int().positive(),
  })
  .strict();

export const blockRankRowsSchema = z.array(blockRankRowSchema);

export type BlockRankRow = z.infer<typeof blockRankRowSchema>;
export type BoroughRankFilter = "ALL" | 1 | 2 | 3 | 4 | 5;

export function filterBlockRanks(
  rows: BlockRankRow[],
  borough: BoroughRankFilter,
  query: string,
): BlockRankRow[] {
  const needle = query.trim().toLocaleLowerCase("en-US");
  return rows.filter(
    (row) =>
      (borough === "ALL" || row.b === borough) &&
      (!needle ||
        String(row.k).includes(needle) ||
        (row.a?.toLocaleLowerCase("en-US").includes(needle) ?? false)),
  );
}

export function chunkBlockRanks(
  rows: BlockRankRow[],
  count: number,
): BlockRankRow[] {
  return rows.slice(0, Math.max(0, count));
}
