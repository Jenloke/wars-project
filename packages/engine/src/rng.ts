/**
 * Mulberry32. The whole generator state is one uint32, which keeps `GameState`
 * plain JSON. Usage: `const next = rngAdvance(seed); const n = rngInt(next, 10);`
 * then store `next` back into state.
 */

const INCREMENT = 0x6d2b79f5;

export function rngAdvance(seed: number): number {
  return (seed + INCREMENT) >>> 0;
}

/** Uniform integer in `0..bound-1` derived from an already-advanced seed. */
export function rngInt(seed: number, bound: number): number {
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return Math.floor(unit * bound);
}
