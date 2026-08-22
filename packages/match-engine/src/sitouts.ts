import { PLAYERS_PER_MATCH } from "./types.js";
import type { EngineState } from "./state.js";

export interface SitOutResult { playing: string[]; sitting: string[]; }

/**
 * Select which players sit out this round.
 *
 * Hard Sit-Out Shield (new): players who sat out in the immediately previous
 * round are strongly penalised — they are sorted to the BACK of the sit-out
 * candidate list so they are the LAST to be asked to sit again. This guarantees
 * no consecutive sit-outs wherever the player/court ratio allows it.
 *
 * Tie-break order within shield groups:
 *   1. Fewer total sit-outs → sit first (equalize)
 *   2. More games played → sit first (give rest to overplayed)
 *   3. Higher play streak → sit first (soft two-game rhythm)
 *   4. Seeded deterministic order as final tiebreak
 */
export function selectSitOuts(
  s: EngineState, available: string[], courtCount: number,
  order: Map<string, number> = new Map(),
  currentRoundNumber = 0,
): SitOutResult {
  const capacity = courtCount * PLAYERS_PER_MATCH;
  const playableCount = Math.min(Math.floor(available.length / PLAYERS_PER_MATCH) * PLAYERS_PER_MATCH, capacity);
  const sitCount = available.length - playableCount;
  if (sitCount <= 0) return { playing: [...available], sitting: [] };

  const prevRound = currentRoundNumber - 1;

  // Sort candidates: those who sat out last round come LAST (hard shield),
  // then sort within each group by normal fairness criteria.
  const ranked = [...available].sort((x, y) => {
    // Hard shield: just-sat-out players are deprioritised for another sit-out
    const xJustSat = prevRound > 0 && s.lastSitOutRound.get(x) === prevRound ? 1 : 0;
    const yJustSat = prevRound > 0 && s.lastSitOutRound.get(y) === prevRound ? 1 : 0;
    if (xJustSat !== yJustSat) return xJustSat - yJustSat; // shielded players rank last

    // Within same shield group: fewer sit-outs → sit first (equalize sit-out count)
    const so = (s.sitOuts.get(x) ?? 0) - (s.sitOuts.get(y) ?? 0);
    if (so !== 0) return so;
    // More games played → sit first (give rest)
    const gp = (s.gamesPlayed.get(y) ?? 0) - (s.gamesPlayed.get(x) ?? 0);
    if (gp !== 0) return gp;
    // Soft rhythm: after fairness is equal, prefer resting players who have
    // played about two games in a row. Cap at 2 so long streaks do not dominate.
    const rhythm = Math.min(s.playStreak.get(y) ?? 0, 2) - Math.min(s.playStreak.get(x) ?? 0, 2);
    if (rhythm !== 0) return rhythm;
    // Deterministic tiebreak
    return (order.get(x) ?? 0) - (order.get(y) ?? 0) || (x < y ? -1 : x > y ? 1 : 0);
  });

  const sitting = ranked.slice(0, sitCount);
  const sittingSet = new Set(sitting);
  return { playing: available.filter((p) => !sittingSet.has(p)), sitting };
}
