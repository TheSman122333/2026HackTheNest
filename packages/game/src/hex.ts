/** Axial hex coordinates (pointy-top). https://www.redblobgames.com/grids/hexagons/ */
export type Hex = { q: number; r: number };
export type HexKey = `${number},${number}`;

export const key = (h: Hex): HexKey => `${h.q},${h.r}`;
export const parseKey = (k: HexKey): Hex => {
  const [q, r] = k.split(',').map(Number) as [number, number];
  return { q, r };
};

export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });
export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => add(h, d));
export const distance = (a: Hex, b: Hex) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** All hexes within `radius` of the origin (radius 0 = just the center). */
export function disk(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push({ q, r });
  }
  return out;
}

export function ring(radius: number): Hex[] {
  return disk(radius).filter((h) => distance(h, { q: 0, r: 0 }) === radius);
}

/** Pixel center for rendering (pointy-top, `size` = corner radius). */
export function toPixel(h: Hex, size: number) {
  return { x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r };
}
