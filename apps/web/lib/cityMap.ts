import { z } from "zod";

const COS_NYC = Math.cos((40.73 * Math.PI) / 180);
const FEET_PER_LATITUDE_DEGREE = 364_000;
export const CITY_MAP_GRID_SIZE = 0.003;

export const blockMapColumnsSchema = z
  .object({
    b: z.array(z.number().int().min(1).max(5)),
    k: z.array(z.number().int().min(0).max(99_999)),
    x: z.array(z.number().int()),
    y: z.array(z.number().int()),
    m: z.array(z.number().nonnegative()),
    a: z.array(z.number().int().nonnegative()),
    d: z.array(z.number().nonnegative().nullable()),
    t: z.array(z.union([z.literal(0), z.literal(1)])),
    r: z.array(z.number().int().positive()),
  })
  .strict();

export type MapMetric = "total" | "density";
export type MapBoroughFilter = "ALL" | 1 | 2 | 3 | 4 | 5;

export interface MapView {
  metric: MapMetric;
  borough: MapBoroughFilter;
}

export interface MapPercentileAnchor {
  percentile: number;
  value: number;
}

export interface CityBlock {
  boro: 1 | 2 | 3 | 4 | 5;
  block: number;
  longitude: number;
  latitude: number;
  worldX: number;
  worldY: number;
  sideWorld: number;
  totalM: number;
  landArea: number;
  density: number | null;
  taxable: boolean;
  rank: number;
}

export interface MapCamera {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface SpatialHash {
  cellSize: number;
  cells: Map<string, CityBlock[]>;
}

function gridKey(x: number, y: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
}

export function decodeBlockMap(value: unknown): CityBlock[] {
  const columns = blockMapColumnsSchema.parse(value);
  const count = columns.b.length;
  for (const [name, column] of Object.entries(columns)) {
    if (column.length !== count) {
      throw new Error(
        `block-map column ${name} has ${column.length} rows; expected ${count}.`,
      );
    }
  }

  return columns.b.map((boro, index) => {
    const landArea = columns.a[index];
    const density = columns.d[index];
    if ((landArea === 0) !== (density === null)) {
      throw new Error(
        `block-map row ${index} has inconsistent land area and density.`,
      );
    }
    const longitude = columns.x[index] / 100_000 - 74.3;
    const latitude = columns.y[index] / 100_000 + 40.4;
    return {
      boro: boro as CityBlock["boro"],
      block: columns.k[index],
      longitude,
      latitude,
      worldX: (columns.x[index] / 100_000) * COS_NYC,
      worldY: -(columns.y[index] / 100_000),
      sideWorld: Math.sqrt(landArea) / FEET_PER_LATITUDE_DEGREE,
      totalM: columns.m[index],
      landArea,
      density,
      taxable: columns.t[index] === 1,
      rank: columns.r[index],
    };
  });
}

export function metricValue(block: CityBlock, metric: MapMetric): number {
  return metric === "total" ? block.totalM : (block.density ?? 0);
}

const BOROUGH_BY_CODE: Record<string, MapBoroughFilter> = {
  MN: 1,
  BX: 2,
  BK: 3,
  QN: 4,
  SI: 5,
};

const CODE_BY_BOROUGH: Record<Exclude<MapBoroughFilter, "ALL">, string> = {
  1: "MN",
  2: "BX",
  3: "BK",
  4: "QN",
  5: "SI",
};

export function mapBoroughCode(borough: MapBoroughFilter): string {
  return borough === "ALL" ? borough : CODE_BY_BOROUGH[borough];
}

export function parseMapView(
  search: URLSearchParams | string,
): MapView {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const metric = params.get("metric") === "density" ? "density" : "total";
  const boroughCode = params.get("boro")?.toUpperCase() ?? "";
  return {
    metric,
    borough: BOROUGH_BY_CODE[boroughCode] ?? "ALL",
  };
}

export function setMapViewSearch(
  search: URLSearchParams,
  view: MapView,
): URLSearchParams {
  const params = new URLSearchParams(search);
  if (view.metric === "total") params.delete("metric");
  else params.set("metric", view.metric);
  if (view.borough === "ALL") params.delete("boro");
  else params.set("boro", mapBoroughCode(view.borough));
  return params;
}

function metricBlocks(
  blocks: CityBlock[],
  metric: MapMetric,
  borough: MapBoroughFilter,
): CityBlock[] {
  return blocks.filter(
    (block) =>
      (borough === "ALL" || block.boro === borough) &&
      (metric === "total" || block.density !== null),
  );
}

export function mapBlockQuantiles(
  blocks: CityBlock[],
  metric: MapMetric,
  borough: MapBoroughFilter,
): Map<CityBlock, number> {
  const ranked = metricBlocks(blocks, metric, borough).sort(
    (left, right) =>
      metricValue(left, metric) - metricValue(right, metric) ||
      left.boro - right.boro ||
      left.block - right.block,
  );
  const quantiles = new Map<CityBlock, number>();
  if (ranked.length === 1) {
    quantiles.set(ranked[0], 0.5);
    return quantiles;
  }

  for (let start = 0; start < ranked.length; ) {
    const value = metricValue(ranked[start], metric);
    let end = start;
    while (
      end + 1 < ranked.length &&
      metricValue(ranked[end + 1], metric) === value
    ) {
      end += 1;
    }
    const quantile = (start + end) / 2 / Math.max(1, ranked.length - 1);
    for (let index = start; index <= end; index += 1) {
      quantiles.set(ranked[index], quantile);
    }
    start = end + 1;
  }
  return quantiles;
}

export function mapMetricPercentiles(
  blocks: CityBlock[],
  metric: MapMetric,
  borough: MapBoroughFilter,
  percentiles: readonly number[] = [0.5, 0.9, 0.99],
): MapPercentileAnchor[] {
  const values = metricBlocks(blocks, metric, borough)
    .map((block) => metricValue(block, metric))
    .sort((left, right) => left - right);
  if (values.length === 0) return [];
  return percentiles.map((percentile) => ({
    percentile,
    value:
      values[
        Math.round(
          Math.min(1, Math.max(0, percentile)) * (values.length - 1),
        )
      ],
  }));
}

export function rankMapBlocks(
  blocks: CityBlock[],
  metric: MapMetric,
  borough: MapBoroughFilter,
  limit = 50,
): CityBlock[] {
  return metricBlocks(blocks, metric, borough)
    .sort(
      (left, right) =>
        metricValue(right, metric) - metricValue(left, metric) ||
        left.boro - right.boro ||
        left.block - right.block,
    )
    .slice(0, Math.max(0, limit));
}

export function fitMapCamera(
  blocks: CityBlock[],
  width: number,
  height: number,
  padding = 30,
): MapCamera {
  if (blocks.length === 0) {
    return { centerX: 0, centerY: 0, scale: 1 };
  }
  const minX = Math.min(...blocks.map((block) => block.worldX));
  const maxX = Math.max(...blocks.map((block) => block.worldX));
  const minY = Math.min(...blocks.map((block) => block.worldY));
  const maxY = Math.max(...blocks.map((block) => block.worldY));
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: Math.min(
      usableWidth / Math.max(maxX - minX, 1e-6),
      usableHeight / Math.max(maxY - minY, 1e-6),
    ),
  };
}

export function buildSpatialHash(
  blocks: CityBlock[],
  cellSize = CITY_MAP_GRID_SIZE,
): SpatialHash {
  const cells = new Map<string, CityBlock[]>();
  for (const block of blocks) {
    // One cell of padding covers the 2px minimum glyph at city scale without
    // changing the one-cell lookup contract.
    const half = block.sideWorld / 2 + cellSize;
    const minX = Math.floor((block.worldX - half) / cellSize);
    const maxX = Math.floor((block.worldX + half) / cellSize);
    const minY = Math.floor((block.worldY - half) / cellSize);
    const maxY = Math.floor((block.worldY + half) / cellSize);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const cell = cells.get(key);
        if (cell) cell.push(block);
        else cells.set(key, [block]);
      }
    }
  }
  return { cellSize, cells };
}

export function spatialCandidates(
  hash: SpatialHash,
  worldX: number,
  worldY: number,
): CityBlock[] {
  return hash.cells.get(gridKey(worldX, worldY, hash.cellSize)) ?? [];
}

export function cityBlockKey(
  boro: number | string,
  block: number | string,
): string {
  return `${boro}:${block}`;
}
