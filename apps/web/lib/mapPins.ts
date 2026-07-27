export interface MapPin {
  boro: 1 | 2 | 3 | 4 | 5;
  block: number;
  label: string;
  dx: number;
  dy: number;
}

export const MAP_PINS: readonly MapPin[] = [
  {
    boro: 4,
    block: 14260,
    label: "JFK AIRPORT · FIRST ON THE REGISTER",
    dx: 26,
    dy: 24,
  },
  {
    boro: 2,
    block: 2490,
    label: "YANKEE STADIUM · ONE LOT",
    dx: 28,
    dy: -24,
  },
  {
    boro: 1,
    block: 1111,
    label: "CENTRAL PARK · ONE LOT",
    dx: 34,
    dy: -28,
  },
  {
    boro: 1,
    block: 995,
    label: "BLOCK 995 · HIGHEST VALUE PER LAND SQ FT",
    dx: 38,
    dy: 28,
  },
] as const;
