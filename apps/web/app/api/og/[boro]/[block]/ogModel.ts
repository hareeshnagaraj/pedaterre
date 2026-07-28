export interface OgLot {
  lot: number;
  v: number;
  nLots?: number;
  club?: boolean;
  you?: boolean;
}

export interface OgBlockPayload {
  borough: string;
  block: number;
  totalMv: number;
  character: "whale" | "spread" | "flat" | "single" | "empty";
  rollYear: string;
  lots: OgLot[];
}

export interface SilhouetteBar {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export type BucketPayload =
  | Record<string, OgBlockPayload>
  | OgBlockPayload[]
  | { blocks: Record<string, OgBlockPayload> | OgBlockPayload[] };

export function normalizedBorough(value: string): string | null {
  const code = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    "1": "MN",
    "2": "BX",
    "3": "BK",
    "4": "QN",
    "5": "SI",
    MN: "MN",
    BX: "BX",
    BK: "BK",
    QN: "QN",
    SI: "SI",
  };
  return aliases[code] ?? null;
}

function boroughDirectory(value: string): string | null {
  const code = normalizedBorough(value);
  if (!code) return null;
  return { MN: "1", BX: "2", BK: "3", QN: "4", SI: "5" }[code] ?? null;
}

function blockFromCollection(
  collection: Record<string, OgBlockPayload> | OgBlockPayload[],
  borough: string,
  block: number,
): OgBlockPayload | null {
  if (Array.isArray(collection)) {
    return (
      collection.find(
        (candidate) =>
          Number(candidate.block) === block &&
          normalizedBorough(String(candidate.borough)) === borough,
      ) ?? null
    );
  }

  const candidate = collection[String(block)];
  if (!candidate || Number(candidate.block) !== block) return null;
  return normalizedBorough(String(candidate.borough)) === borough
    ? candidate
    : null;
}

export function pickBlockFromBucket(
  bucket: BucketPayload,
  boroughValue: string,
  block: number,
): OgBlockPayload | null {
  const borough = normalizedBorough(boroughValue);
  if (!borough || !Number.isSafeInteger(block) || block < 0) return null;

  if ("blocks" in bucket) {
    return blockFromCollection(
      bucket.blocks as Record<string, OgBlockPayload> | OgBlockPayload[],
      borough,
      block,
    );
  }
  return blockFromCollection(bucket, borough, block);
}

export function bucketUrl(
  origin: string,
  boroughValue: string,
  block: number,
): string | null {
  const borough = normalizedBorough(boroughValue);
  const directory = boroughDirectory(boroughValue);
  if (!borough || !directory || !Number.isSafeInteger(block) || block < 0) {
    return null;
  }
  const base = new URL(origin);
  return new URL(
    `/data/buckets/${directory}/${Math.floor(block / 10)}.json`,
    base.origin,
  ).toString();
}

export function topGroupValues(
  payload: Pick<OgBlockPayload, "lots">,
  limit = 12,
): number[] {
  return payload.lots
    .map((lot) => Number(lot.v))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, limit));
}

export function silhouetteBars(
  values: number[],
  width = 560,
  height = 430,
): SilhouetteBar[] {
  const clean = values
    .slice(0, 12)
    .map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0));
  if (!clean.length) return [];

  const gap = 9;
  const barWidth = Math.max(
    6,
    (width - gap * (clean.length - 1)) / clean.length,
  );
  const maximum = Math.max(...clean, 1);
  const minimumHeight = Math.min(24, height * 0.08);

  return clean.map((value, index) => {
    const scaled =
      minimumHeight + Math.sqrt(value / maximum) * (height - minimumHeight);
    const barHeight = Math.min(height, Math.max(minimumHeight, scaled));
    return {
      x: index * (barWidth + gap),
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      value,
    };
  });
}

export async function loadBlockForOg(
  origin: string,
  borough: string,
  block: number,
  fetcher: typeof fetch = fetch,
): Promise<OgBlockPayload | null> {
  const url = bucketUrl(origin, borough, block);
  if (!url) return null;

  try {
    const response = await fetcher(url, { cache: "force-cache" });
    if (!response.ok) return null;
    return pickBlockFromBucket(
      (await response.json()) as BucketPayload,
      borough,
      block,
    );
  } catch {
    return null;
  }
}

export async function loadRollYearForOg(
  origin: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const url = new URL("/data/city-stats.json", new URL(origin).origin);
    const response = await fetcher(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const value = (await response.json()) as { rollYear?: unknown };
    return typeof value.rollYear === "string" && value.rollYear.trim()
      ? value.rollYear.trim()
      : null;
  } catch {
    return null;
  }
}
