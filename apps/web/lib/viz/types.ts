import type { Lot } from "../schema";

export type Point = {
  x: number;
  y: number;
};

export type ProjectedPoint = Point & {
  depth: number;
  s: number;
};

export type Origin = Point;

export type FitState = {
  origin: Origin;
  fitScale: number;
  fitPanX: number;
  fitPanY: number;
};

export type ProjectionState = FitState & {
  angle: number;
  tilt: number;
  userZoom: number;
  canvasWidth: number;
  canvasHeight: number;
};

export type TreemapNode = {
  lot: Lot;
  area: number;
};

export type TreemapCell = {
  lot: Lot;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ThermalDistrict = {
  kind: "lead" | "rest";
  x: number;
  y: number;
  w: number;
  h: number;
  share: number;
  label: string | null;
};

export type TreemapLayout = {
  cells: TreemapCell[];
  districts: ThermalDistrict[];
};
