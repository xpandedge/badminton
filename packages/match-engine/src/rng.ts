/** Small deterministic PRNG (mulberry32). Good enough for reproducible tie-breaks. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic per-player ordering derived from `seed`, used as the FINAL
 * tie-breaker in scheduling instead of raw lexical playerId order. A seeded
 * Fisher–Yates shuffle means: same seed → identical output (reproducible),
 * different seed → a different-but-fair assignment, and no systematic bias
 * toward whichever id sorts first (PRD §14.1, fixes lexical-bias).
 */
export function seededOrder(ids: string[], seed: number): Map<string, number> {
  const rng = mulberry32(seed);
  const shuffled = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // stable base
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return new Map(shuffled.map((id, idx) => [id, idx] as const));
}
