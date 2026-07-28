import {
  CARD_COPY,
  CARD_TEXT_LIMITS,
  truncateText,
} from "./cardLayout";

export type BlockCharacter = "whale" | "spread" | "flat" | "single" | "empty";

export interface ShareLot {
  lot: number;
  v: number;
  c?: number;
  r?: number;
  nLots?: number;
  club?: boolean;
  you?: boolean;
}

export interface AddressedLot {
  lot: number | string;
  value?: number;
  valueM?: number;
  label?: string;
}

export interface ShareCardPayload {
  borough: string;
  block: number;
  totalMv: number;
  totalM?: number;
  rank?: number;
  rankLabel?: string;
  percentile?: number;
  largestGroupShare?: number | null;
  nLots?: number;
  nGroups?: number;
  character: BlockCharacter;
  rollYear: string;
  address?: string;
  addressHint?: string;
  quip?: string;
  lots?: ShareLot[];
  addressedLot?: AddressedLot | number | string | null;
  addressedLotNumber?: number | string | null;
}

export interface ShareCardModel {
  where: string;
  subline: string;
  dollars: string;
  rank: string;
  quip: string;
  addressedLot: string | null;
  stamp: string;
  source: string;
}

const BOROUGH = Object.freeze({
  MN: { code: "MN", name: "Manhattan" },
  BX: { code: "BX", name: "Bronx" },
  BK: { code: "BK", name: "Brooklyn" },
  QN: { code: "QN", name: "Queens" },
  SI: { code: "SI", name: "Staten Island" },
  "1": { code: "MN", name: "Manhattan" },
  "2": { code: "BX", name: "Bronx" },
  "3": { code: "BK", name: "Brooklyn" },
  "4": { code: "QN", name: "Queens" },
  "5": { code: "SI", name: "Staten Island" },
} as const);

export function boroughIdentity(value: string): { code: string; name: string } {
  const normalized = String(value).trim().toUpperCase();
  return (
    BOROUGH[normalized as keyof typeof BOROUGH] ?? {
      code: normalized.slice(0, 2) || "NY",
      name: normalized || "New York City",
    }
  );
}

export function stampFor(
  payload: Pick<ShareCardPayload, "borough" | "block" | "rollYear">,
): string {
  return `PD-${boroughIdentity(payload.borough).code}-${Math.trunc(payload.block)}-${compactRollYear(payload.rollYear)}`;
}

export function compactRollYear(rollYear: string): string {
  const normalized = rollYear.trim().toUpperCase();
  const calendarYear = normalized.match(/(\d{2})$/)?.[1];
  return calendarYear ? `FY${calendarYear}` : normalized;
}

export function formatAssessedValue(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe === 0) return "$0";
  if (safe >= 1_000_000_000_000) {
    return `$${(safe / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (safe >= 1_000_000_000) {
    const billions = safe / 1_000_000_000;
    return `$${billions >= 100 ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  if (safe >= 1_000_000) {
    const millions = safe / 1_000_000;
    return `$${millions >= 100 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (safe >= 1_000) return `$${Math.round(safe / 1_000)}K`;
  return `$${Math.round(safe)}`;
}

function totalValue(payload: ShareCardPayload): number {
  if (Number.isFinite(payload.totalMv)) return payload.totalMv;
  return Number.isFinite(payload.totalM)
    ? (payload.totalM ?? 0) * 1_000_000
    : 0;
}

function addressedLotFor(payload: ShareCardPayload): AddressedLot | null {
  if (payload.addressedLot != null) {
    if (typeof payload.addressedLot === "object") return payload.addressedLot;
    return { lot: payload.addressedLot };
  }

  const requested = payload.addressedLotNumber;
  const lot =
    payload.lots?.find((candidate) => candidate.you) ??
    payload.lots?.find(
      (candidate) =>
        requested != null && String(candidate.lot) === String(requested),
    );

  if (!lot) return null;
  return { lot: lot.lot, valueM: lot.v };
}

function formatAddressedLot(payload: ShareCardPayload): string | null {
  const addressed = addressedLotFor(payload);
  if (!addressed) return null;

  const label = addressed.label?.trim() || `LOT ${addressed.lot}`;
  const value =
    addressed.value != null
      ? addressed.value
      : addressed.valueM != null
        ? addressed.valueM * 1_000_000
        : undefined;

  return value == null
    ? truncateText(label, CARD_TEXT_LIMITS.addressedLot)
    : truncateText(
        `${label} · ${formatAssessedValue(value)}`,
        CARD_TEXT_LIMITS.addressedLot,
      );
}

function generatedQuip(payload: ShareCardPayload): string {
  const lots = payload.lots ?? [];
  const positive = lots
    .map((lot) => lot.v)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const groups = payload.nGroups ?? lots.length;
  const clubCount = lots.filter((lot) => lot.club).length;
  const share = Math.max(0, payload.largestGroupShare ?? 0);
  const sharePercent = Math.round(share * 100);
  const max = positive.at(-1) ?? 0;
  const median = positive.length
    ? positive[Math.floor((positive.length - 1) / 2)]
    : 0;
  const multiple =
    median > 0 ? Math.max(1, Math.round((max / median) * 10) / 10) : 1;
  const spread =
    positive.length > 1 && positive[0] > 0
      ? Math.max(1, Math.round((max / positive[0]) * 10) / 10)
      : 1;

  switch (payload.character) {
    case "whale":
      return share >= 0.45
        ? `One building is ${sharePercent}% of the block's assessed value.`
        : `The largest holding here carries ${sharePercent}% of the block.`;
    case "spread":
      return clubCount
        ? `${clubCount} of ${groups} property groups on this block clear $50M.`
        : `${groups} property groups. The top one is ${multiple}× the median holding here.`;
    case "flat":
      return `${groups} holdings, all within ${spread}× of each other. No single filing dominates.`;
    case "single":
      return "One lot. The whole block. One line in the roll.";
    case "empty":
      return "Assessed at zero. The roll has nothing to say here.";
  }
}

function rankLine(payload: ShareCardPayload): string {
  if (payload.rankLabel?.trim()) {
    return truncateText(payload.rankLabel, CARD_TEXT_LIMITS.rank);
  }
  if (Number.isFinite(payload.percentile) && (payload.percentile ?? 0) > 0) {
    const percentile = Math.max(0.1, payload.percentile ?? 0);
    return `Top ${percentile.toFixed(percentile < 1 ? 1 : 0)}% of NYC blocks`;
  }
  if (Number.isFinite(payload.rank) && (payload.rank ?? 0) > 0) {
    return `City rank #${Math.trunc(payload.rank ?? 0).toLocaleString("en-US")}`;
  }
  return `NYC assessment roll · ${payload.rollYear}`;
}

export function buildShareCardModel(payload: ShareCardPayload): ShareCardModel {
  const borough = boroughIdentity(payload.borough);
  const identity = `${borough.code} Block ${Math.trunc(payload.block)}`;
  const place = payload.address?.trim() || payload.addressHint?.trim();
  const nLots = Math.max(
    0,
    Math.trunc(payload.nLots ?? payload.lots?.length ?? 0),
  );
  const nGroups = Math.max(
    0,
    Math.trunc(payload.nGroups ?? payload.lots?.length ?? 0),
  );
  const combined = nLots > nGroups ? " · condo lots combined" : "";

  return {
    where: truncateText(
      place
        ? `${place} · ${identity}`
        : `${borough.name} · Block ${Math.trunc(payload.block)}`,
      CARD_TEXT_LIMITS.where,
    ),
    subline: truncateText(
      `${nLots} tax lots · ${nGroups} groups${combined}`,
      CARD_TEXT_LIMITS.subline,
    ),
    dollars:
      payload.character === "empty"
        ? "assessed at $0"
        : formatAssessedValue(totalValue(payload)),
    rank: rankLine(payload),
    quip: truncateText(
      payload.quip?.trim() || generatedQuip(payload),
      CARD_TEXT_LIMITS.quip,
    ),
    addressedLot: formatAddressedLot(payload),
    stamp: stampFor(payload),
    source: CARD_COPY.source,
  };
}

export { truncateText } from "./cardLayout";
