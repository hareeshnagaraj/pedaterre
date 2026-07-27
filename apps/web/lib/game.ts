import type { BlockRankRow } from "./blockRanks";

export const GAME_RATIO_MIN = 1.15;

export interface GamePair {
  left: BlockRankRow;
  right: BlockRankRow;
  ratio: number;
}

export interface DifficultyBand {
  min: number;
  max: number;
}

export type GameRandom = () => number;

export function normalizeGameSeed(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return /^[0-9a-z]{1,24}$/.test(normalized) ? normalized : null;
}

function seedState(seed: string): number {
  let state = 0x9e3779b9;
  for (const character of seed) {
    state = Math.imul(state ^ Number.parseInt(character, 36), 0x45d9f3b);
    state ^= state >>> 16;
  }
  return state || 0x6d2b79f5;
}

export function createGameRandom(seed: string): GameRandom {
  let state = seedState(normalizeGameSeed(seed) ?? "0");
  return () => {
    // Xorshift32 keeps a run reproducible without a client-side dependency.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function difficultyBand(streak: number): DifficultyBand {
  const progress = Math.min(10, Math.max(0, Math.trunc(streak))) / 10;
  // The upper bound contracts linearly from 3.0× to 1.2× by streak 10.
  // Keeping five points above 1.15× leaves a workable candidate pool.
  return {
    min: GAME_RATIO_MIN,
    max: 3 - progress * 1.8,
  };
}

export function gameBlockKey(
  block: Pick<BlockRankRow, "b" | "k">,
): string {
  return `${block.b}-${block.k}`;
}

export function gamePairRatio(
  first: Pick<BlockRankRow, "m">,
  second: Pick<BlockRankRow, "m">,
): number {
  const lower = Math.min(first.m, second.m);
  return lower > 0
    ? Math.max(first.m, second.m) / lower
    : Number.POSITIVE_INFINITY;
}

export function isGamePayloadEligible(payload: { nGroups: number }): boolean {
  return payload.nGroups >= 3;
}

function randomIndex(length: number, random: GameRandom): number {
  return Math.min(length - 1, Math.floor(Math.max(0, random()) * length));
}

export function selectGamePair(
  rows: readonly BlockRankRow[],
  streak: number,
  used: ReadonlySet<string>,
  random: GameRandom,
): GamePair | null {
  const band = difficultyBand(streak);
  const eligible = rows.filter(
    (row) => row.t === true && row.m > 0 && !used.has(gameBlockKey(row)),
  );
  if (eligible.length < 2) return null;

  const start = randomIndex(eligible.length, random);
  for (let offset = 0; offset < eligible.length; offset += 1) {
    const anchor = eligible[(start + offset) % eligible.length];
    const matches = eligible.filter((candidate) => {
      if (candidate === anchor) return false;
      const ratio = gamePairRatio(anchor, candidate);
      // The published character is the ETL's silhouette class (flat, spread,
      // whale, and so on). Pairing different classes rejects flat/flat grids
      // and guarantees a categorical skyline cue without fetching every block.
      return (
        candidate.c !== anchor.c &&
        ratio >= band.min &&
        ratio <= band.max
      );
    });
    if (!matches.length) continue;

    const partner = matches[randomIndex(matches.length, random)];
    const ratio = gamePairRatio(anchor, partner);
    return random() < 0.5
      ? { left: anchor, right: partner, ratio }
      : { left: partner, right: anchor, ratio };
  }

  return null;
}
