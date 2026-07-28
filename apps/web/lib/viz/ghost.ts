import type { BlockPayload, Lot } from "../schema.ts";
import { hScale } from "./projection.ts";

const MAX_GHOST_RATIO = 3;
const VACANT_GHOST_PROPORTION = 0.5;
const MINIMUM_BUILT_HEIGHT = hScale(Number.MIN_VALUE);

export function ghostHeight(
  lot: Lot,
  blockMedianBuiltHeight: number,
): number {
  if (lot.ghost == null || lot.ghost <= 0) return 0;
  if (lot.builtSqft == null || lot.builtSqft <= 0) {
    // No supported ratio exists, so use half the block median as a modest fallback.
    const medianHeight =
      Number.isFinite(blockMedianBuiltHeight) && blockMedianBuiltHeight > 0
        ? blockMedianBuiltHeight
        : MINIMUM_BUILT_HEIGHT;
    return medianHeight * VACANT_GHOST_PROPORTION;
  }

  // Cap the area ratio so a small existing building cannot create an absurd spike.
  const ratio = Math.min(lot.ghost / lot.builtSqft, MAX_GHOST_RATIO);
  return builtHeight(lot) * ratio;
}

export function builtHeight(lot: Lot): number {
  return hScale(lot.v);
}

export function medianBuiltHeight(lots: readonly Lot[]): number {
  const heights = lots
    .map(builtHeight)
    .filter((height) => height > 0)
    .sort((a, b) => a - b);
  if (heights.length === 0) return MINIMUM_BUILT_HEIGHT;
  const middle = Math.floor(heights.length / 2);
  return heights.length % 2 === 0
    ? (heights[middle - 1] + heights[middle]) / 2
    : heights[middle];
}

export function permittedHeight(
  lot: Lot,
  blockMedianBuiltHeight: number,
): number {
  return builtHeight(lot) + ghostHeight(lot, blockMedianBuiltHeight);
}

export function hasGhostMassing(payload: BlockPayload): boolean {
  return (
    payload.capacitySqft != null &&
    payload.lots.some((lot) => lot.ghost != null)
  );
}

export function formatSquareFeet(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} SQ FT`;
}

export function empireStateEquivalents(
  capacitySqft: number,
  empireStateSqft: number,
): number {
  if (capacitySqft <= 0 || empireStateSqft <= 0) return 0;
  return capacitySqft / empireStateSqft;
}
