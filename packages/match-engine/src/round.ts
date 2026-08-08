import type { EngineCourt, EnginePlayer, GeneratedMatch, GeneratedSitOut, SitOutReason } from "./types.js";
import { PLAYERS_PER_MATCH } from "./types.js";
import { recordMatch, recordSitOut, type EngineState } from "./state.js";
import { bestTeamSplit, foursomePenalty, type FoursomePlayer } from "./penalty.js";
import { selectSitOuts } from "./sitouts.js";

export interface RoundResult { matches: GeneratedMatch[]; sitOuts: GeneratedSitOut[]; }

/** Build one round, mutating `state`. Players already filtered to schedulable+available.
 *  `order` is the seeded deterministic tie-break ordering (PRD §14.1). */
export function buildRound(
  state: EngineState, players: EnginePlayer[], courts: EngineCourt[], roundNumber: number,
  order: Map<string, number> = new Map(),
): RoundResult {
  const byId = new Map(players.map((p) => [p.playerId, p] as const));
  const { playing, sitting } = selectSitOuts(state, players.map((p) => p.playerId), courts.length, order, roundNumber);

  const pool = new Set(playing);
  const matches: GeneratedMatch[] = [];
  // §23: only required courts — rotate starting index so small groups cycle through courts
  const requiredCount = Math.floor(playing.length / PLAYERS_PER_MATCH);
  const startIdx = (roundNumber - 1) % courts.length;
  const rotated = [...courts.slice(startIdx), ...courts.slice(0, startIdx)];
  const courtsToUse = rotated.slice(0, requiredCount);

  for (let m = 0; m < courtsToUse.length; m++) {
    const four = pickLowestPenaltyFoursome(state, pool, byId, order);
    for (const id of four) pool.delete(id);
    const split = bestTeamSplit(state, four.map((id) => ({ playerId: id, skillLevel: byId.get(id)!.skillLevel })));
    recordMatch(state, roundNumber, split.teamA, split.teamB);
    const court = courtsToUse[m]!;
    matches.push({ roundNumber, courtId: court.courtId, matchNumber: m + 1, teamA: split.teamA, teamB: split.teamB });
  }
  for (const id of sitting) recordSitOut(state, id, roundNumber);

  // DELTA_SPEC D2/§23: when more available players than court capacity, the
  // forced sit-outs are "overflow"; otherwise they're the even-rotation remainder.
  const capacity = courts.length * PLAYERS_PER_MATCH;
  const reason: SitOutReason = players.length > capacity ? "overflow" : "rotation";

  return {
    matches,
    sitOuts: sitting.map((playerId) => ({ roundNumber, playerId, reason })),
  };
}

/** Greedy: anchor the least-played remaining player, then add the 3 that minimise penalty. */
function pickLowestPenaltyFoursome(
  state: EngineState, pool: Set<string>, byId: Map<string, EnginePlayer>, order: Map<string, number>,
): [string, string, string, string] {
  const ids = [...pool];
  const anchor = ids.sort((a, b) =>
    (state.gamesPlayed.get(a) ?? 0) - (state.gamesPlayed.get(b) ?? 0)
    || (order.get(a) ?? 0) - (order.get(b) ?? 0)
    || (a < b ? -1 : a > b ? 1 : 0))[0]!;
  const rest = ids.filter((id) => id !== anchor);
  const fp = (id: string): FoursomePlayer => ({ playerId: id, skillLevel: byId.get(id)!.skillLevel });

  let best: { four: [string, string, string, string]; pen: number } | null = null;
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++)
      for (let k = j + 1; k < rest.length; k++) {
        const four = [anchor, rest[i]!, rest[j]!, rest[k]!] as [string, string, string, string];
        const pen = foursomePenalty(state, four.map(fp));
        if (!best || pen < best.pen) best = { four, pen };
      }
  return best!.four;
}