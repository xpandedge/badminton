import { PLAYERS_PER_MATCH } from "./types.js";
import type { EngineState } from "./state.js";

export interface SitOutResult { playing: string[]; sitting: string[]; }

export function selectSitOuts(
  s: EngineState, available: string[], courtCount: number, order: Map<string, number> = new Map(),
): SitOutResult {
  const capacity = courtCount * PLAYERS_PER_MATCH;
  const playableCount = Math.min(Math.floor(available.length / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH, capacity);
  const sitCount = available.length - playableCount;
  if (sitCount <= 0) return { playing: [...available], sitting: [] };

  // Sit those with the FEWEST sit-outs first (even them up), then MOST games,
  // then the seeded deterministic order (PRD §14.1) as final tie-break.
  const ranked = [...available].sort((x, y) => {
    const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
    if (so !== 0) return so;
    const gp = (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0);
    if (gp !== 0) return gp;
    return (order.get(x) ?? 0) - (order.get(y) ?? 0) || (x < y ? -1 : x > y ? 1 : 0);
  });
  const sitting = ranked.slice(0, sitCount);
  const sittingSet = new Set(sitting);
  return { playing: available.filter((p) => !sittingSet.has(p)), sitting };
}