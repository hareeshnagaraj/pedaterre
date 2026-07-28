import type { BlockPayload, Lot } from "../schema.ts";
import { hScale } from "./projection.ts";

const SQFT_PER_MILLION = 1_000_000;
// Capacity adds height above the skyline's positive-value floor.
const HEIGHT_FLOOR = hScale(Number.MIN_VALUE);

export function ghostHeight(capacitySqft: number | null | undefined): number {
  if (capacitySqft == null || capacitySqft <= 0) return 0;
  return Math.max(
    0,
    hScale(capacitySqft / SQFT_PER_MILLION) - HEIGHT_FLOOR,
  );
}

export function builtHeight(lot: Lot): number {
  return hScale(lot.v);
}

export function permittedHeight(lot: Lot): number {
  return builtHeight(lot) + ghostHeight(lot.ghost);
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
