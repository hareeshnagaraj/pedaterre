import { z } from "zod";

export const lotSchema = z.object({
  bbl: z.string(),
  lot: z.number().int(),
  c: z.number().int().nonnegative(),
  r: z.number().int().nonnegative(),
  v: z.number().nonnegative(),
  nLots: z.number().int().positive(),
  owner: z.string().optional(),
  ownerRaw: z.string().optional(),
  you: z.boolean().optional(),
  club: z.boolean().optional(),
  zero: z.boolean().optional(),
  ghost: z.number().int().nonnegative().nullable().optional(),
});

export const blockPayloadSchema = z.object({
  borough: z.string().min(2),
  block: z.number().int().nonnegative(),
  bblPrefix: z.string(),
  largestLotBbl: z.string().regex(/^[1-5]\d{9}$/).optional(),
  totalMv: z.number().nonnegative(),
  totalM: z.number().nonnegative(),
  rank: z.number().int().nonnegative(),
  rankTaxable: z.number().int().nonnegative(),
  percentile: z.number().min(0).max(100),
  largestGroupShare: z.number().min(0).max(1).nullable(),
  llcShare: z.number().min(0).max(1),
  nLots: z.number().int().positive(),
  nGroups: z.number().int().positive(),
  character: z.enum(["whale", "spread", "flat", "single", "empty"]),
  rollYear: z.string(),
  extractHash: z.string(),
  addressHint: z.string().optional(),
  quip: z.string().optional(),
  latitude: z.number().min(40).max(41).nullable().optional(),
  longitude: z.number().min(-75).max(-73).nullable().optional(),
  landArea: z.number().int().nonnegative().nullable().optional(),
  builtSqft: z.number().int().nonnegative().nullable().optional(),
  capacitySqft: z.number().int().nonnegative().nullable().optional(),
  unknownLots: z.number().int().nonnegative().nullable().optional(),
  ghostRatio: z.number().min(0).max(1).nullable().optional(),
  lotToGroup: z.record(z.string(), z.number().int().nonnegative()),
  lots: z.array(lotSchema).min(1),
});

export type BlockPayload = z.infer<typeof blockPayloadSchema>;
export type Lot = z.infer<typeof lotSchema>;
