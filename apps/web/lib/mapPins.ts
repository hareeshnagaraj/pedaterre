export interface MapPin {
  boro: 1 | 2 | 3 | 4 | 5;
  block: number;
  name: string;
  dx: number;
  dy: number;
}

export const MAP_PINS: readonly MapPin[] = [
  {
    boro: 4,
    block: 14260,
    name: "JFK AIRPORT",
    dx: 26,
    dy: 24,
  },
  {
    boro: 2,
    block: 2490,
    name: "YANKEE STADIUM",
    dx: 28,
    dy: -24,
  },
  {
    boro: 1,
    block: 1111,
    name: "CENTRAL PARK",
    dx: 34,
    dy: -28,
  },
  {
    boro: 1,
    block: 995,
    name: "BLOCK 995",
    dx: 38,
    dy: 28,
  },
] as const;

interface MapPinBlockFacts {
  rank: number;
  density: number | null;
}

export function mapPinLabel(
  pin: MapPin,
  block: MapPinBlockFacts,
  highestDensity: number | null,
): string {
  const facts: string[] = [];
  if (block.rank === 1) facts.push("FIRST ON THE REGISTER");
  if (block.density !== null && block.density === highestDensity) {
    facts.push("HIGHEST VALUE PER LAND SQ FT");
  }
  return [pin.name, ...facts].join(" · ");
}
