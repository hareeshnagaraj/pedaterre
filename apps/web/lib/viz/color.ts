export function thermalRampRGB(position: number) {
  const t = Math.min(1, Math.max(0, position));
  // multi-hue sequential — mid lightness stepped up for dark-bg legibility
  const stops = [
    { t: 0, r: 16, g: 20, b: 38 },
    { t: 0.1, r: 30, g: 40, b: 78 },
    { t: 0.2, r: 32, g: 60, b: 108 },
    { t: 0.3, r: 34, g: 90, b: 118 },
    { t: 0.4, r: 40, g: 122, b: 108 },
    { t: 0.5, r: 56, g: 138, b: 88 },
    { t: 0.58, r: 82, g: 146, b: 70 },
    { t: 0.66, r: 114, g: 150, b: 56 },
    { t: 0.74, r: 150, g: 148, b: 50 },
    { t: 0.82, r: 180, g: 140, b: 48 },
    { t: 0.91, r: 206, g: 124, b: 44 },
    { t: 1, r: 220, g: 108, b: 40 },
  ];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1].t) i++;
  const a = stops[i], b = stops[i + 1];
  const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  // smoothstep for cleaner mid transitions (less banding)
  const s = u * u * (3 - 2 * u);
  const r = a.r + (b.r - a.r) * s;
  const g = a.g + (b.g - a.g) * s;
  const bl = a.b + (b.b - a.b) * s;
  const lr = Math.min(255, r + 28), lg = Math.min(255, g + 22), lb = Math.min(255, bl + 16);
  return {
    t,
    fill: `rgb(${r|0},${g|0},${bl|0})`,
    light: `rgb(${lr|0},${lg|0},${lb|0})`,
    dark: `rgb(${(r * 0.66)|0},${(g * 0.66)|0},${(bl * 0.66)|0})`,
  };
}

export function thermalRGB(v: number, maxV: number) {
  let t = Math.min(1, Math.max(0, Math.log10(v + 1) / Math.log10(maxV + 1)));
  // mild gamma: open mids without washing whales
  t = Math.pow(t, 0.68);
  return thermalRampRGB(t);
}
