/** Deterministic PRNG so the server and the client agree on every roll. */
export type Rng = () => number;

export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFrom = (...parts: (string | number)[]) => mulberry32(hashSeed(...parts));

export const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error('pick from empty');
  return xs[Math.floor(rng() * xs.length)]!;
}

export function weighted<T extends string>(rng: Rng, table: Partial<Record<T, number>>): T {
  const entries = Object.entries(table) as [T, number][];
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}
