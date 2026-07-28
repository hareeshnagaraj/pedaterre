import { z } from "zod";
import type { BoroughRankFilter } from "./blockRanks";

export const CLUB_LOT_CHUNK_SIZE = 200;

const clubLotRowSchema = z
  .object({
    bbl: z.string().regex(/^[1-5]\d{9}$/),
    boro: z.number().int().min(1).max(5),
    block: z.number().int().min(0).max(99_999),
    lot: z.number().int().min(0).max(9_999),
    mv: z.number().int().gt(50_000_000),
    owner: z.string().optional(),
    address: z.string(),
    bldgClass: z.string(),
    taxable: z.boolean(),
  })
  .strict();

export const clubLotRowsSchema = z.array(clubLotRowSchema);

export type ClubLotRow = z.infer<typeof clubLotRowSchema>;
export type RankedClubLotRow = ClubLotRow & { rank: number };
export interface ClubBlockScope {
  boro: 1 | 2 | 3 | 4 | 5;
  block: number;
}

export function rankClubLots(rows: ClubLotRow[]): RankedClubLotRow[] {
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function filterClubLots(
  rows: RankedClubLotRow[],
  borough: BoroughRankFilter,
  query: string,
  blockScope: ClubBlockScope | null = null,
): RankedClubLotRow[] {
  const needle = query.trim().toLocaleLowerCase("en-US");
  return rows.filter(
    (row) =>
      (borough === "ALL" || row.boro === borough) &&
      (blockScope === null ||
        (row.boro === blockScope.boro && row.block === blockScope.block)) &&
      (!needle ||
        row.address.toLocaleLowerCase("en-US").includes(needle) ||
        (row.owner?.toLocaleLowerCase("en-US").includes(needle) ?? false)),
  );
}

export function chunkClubLots(
  rows: RankedClubLotRow[],
  count: number,
): RankedClubLotRow[] {
  return rows.slice(0, Math.max(0, count));
}
