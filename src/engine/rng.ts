// Gerador pseudoaleatório com semente (mulberry32). Mesma semente, mesmo
// resultado: é o que vai permitir ao servidor reproduzir e auditar corridas.

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  chance(p: number): boolean;
  gauss(sigma?: number): number;
  pick<T>(arr: readonly T[]): T;
  fork(label: string): Rng;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    gauss: (sigma = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (label) => createRng(hashString(`${seed}:${label}`)),
  };
  return rng;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
