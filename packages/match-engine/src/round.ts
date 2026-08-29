import type { EngineCourt, EnginePlayer, GeneratedMatch, GeneratedSitOut, SitOutReason } from "./types.js";
import { PLAYERS_PER_MATCH } from "./types.js";
import { pairKey, recordMatch, recordSitOut, type EngineState } from "./state.js";
import { bestTeamSplit, foursomePenalty, DEFAULT_WEIGHTS, type FoursomePlayer, type Weights } from "./penalty.js";
import { planSitOuts, type SitOutResult } from "./sitouts.js";

export interface RoundResult { matches: GeneratedMatch[]; sitOuts: GeneratedSitOut[]; }
type Foursome = [string, string, string, string];

/** Build one round, mutating `state`. Players already filtered to schedulable+available.
 *  `order` is the seeded deterministic tie-break ordering (PRD §14.1). */
export function buildRound(
  state: EngineState, players: EnginePlayer[], courts: EngineCourt[], roundNumber: number,
  order: Map<string, number> = new Map(),
): RoundResult {
  const byId = new Map(players.map((p) => [p.playerId, p] as const));
  const { playing, sitting } = chooseWhoPlays(
    state,
    players.map((p) => p.playerId),
    courts.length,
    order,
    roundNumber,
    byId,
  );

  const pool = new Set(playing);
  const matches: GeneratedMatch[] = [];
  // §23: only required courts — rotate starting index so small groups cycle through courts
  const requiredCount = Math.floor(playing.length / PLAYERS_PER_MATCH);
  const startIdx = (roundNumber - 1) % courts.length;
  const rotated = [...courts.slice(startIdx), ...courts.slice(0, startIdx)];
  const courtsToUse = rotated.slice(0, requiredCount);
  const foursomes = pickCourtFoursomes(state, pool, byId, order, courtsToUse.length);

  for (let m = 0; m < courtsToUse.length; m++) {
    const four = foursomes[m] ?? pickLowestPenaltyFoursome(state, pool, byId, order);
    for (const id of four) pool.delete(id);
    const split = bestTeamSplit(state, four.map((id) => toFoursomePlayer(id, byId)));
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

function pickCourtFoursomes(
  state: EngineState, pool: Set<string>, byId: Map<string, EnginePlayer>, order: Map<string, number>, groupCount: number,
): Foursome[] {
  const ids = [...pool];
  if (groupCount <= 1 || ids.length > 12 || ids.length !== groupCount * PLAYERS_PER_MATCH) {
    return pickGreedyFoursomes(state, pool, byId, order, groupCount);
  }

  return pickLowestPenaltyPartition(state, ids, byId, order) ?? pickGreedyFoursomes(state, pool, byId, order, groupCount);
}

function pickGreedyFoursomes(
  state: EngineState, pool: Set<string>, byId: Map<string, EnginePlayer>, order: Map<string, number>, groupCount: number,
): Foursome[] {
  const scratch = new Set(pool);
  const foursomes: Array<[string, string, string, string]> = [];
  for (let i = 0; i < groupCount; i++) {
    const four = pickLowestPenaltyFoursome(state, scratch, byId, order);
    foursomes.push(four);
    for (const id of four) scratch.delete(id);
  }
  return foursomes;
}

function pickLowestPenaltyPartition(
  state: EngineState, ids: string[], byId: Map<string, EnginePlayer>, order: Map<string, number>,
): Foursome[] | null {
  const sorted = sortPlayerIds(ids, order);
  let bestGroups: Foursome[] | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestSignature = "";

  const visit = (remaining: string[], groups: Foursome[], penalty: number) => {
    if (remaining.length === 0) {
      const normalized = sortFoursomes(groups, order);
      const signature = partitionSignature(normalized, order);
      if (!bestGroups || penalty < bestPenalty || (penalty === bestPenalty && signature < bestSignature)) {
        bestGroups = normalized;
        bestPenalty = penalty;
        bestSignature = signature;
      }
      return;
    }

    const anchor = remaining[0]!;
    const rest = remaining.slice(1);
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        for (let k = j + 1; k < rest.length; k++) {
          const four = sortPlayerIds([anchor, rest[i]!, rest[j]!, rest[k]!], order) as [string, string, string, string];
          const fourSet = new Set(four);
          const nextRemaining = remaining.filter((id) => !fourSet.has(id));
          const fourPenalty = foursomePenalty(state, four.map((id) => toFoursomePlayer(id, byId)));
          if (bestGroups && penalty + fourPenalty > bestPenalty) continue;
          visit(nextRemaining, [...groups, four], penalty + fourPenalty);
        }
      }
    }
  };

  visit(sorted, [], 0);
  return bestGroups;
}

function sortFoursomes(
  groups: Foursome[], order: Map<string, number>,
): Foursome[] {
  return groups
    .map((group) => sortPlayerIds(group, order) as [string, string, string, string])
    .sort((a, b) => groupSignature(a, order).localeCompare(groupSignature(b, order)));
}

function partitionSignature(groups: Foursome[], order: Map<string, number>): string {
  return groups.map((group) => groupSignature(group, order)).join("/");
}

function groupSignature(group: [string, string, string, string], order: Map<string, number>): string {
  return sortPlayerIds(group, order).join(",");
}

function sortPlayerIds(ids: string[], order: Map<string, number>): string[] {
  return [...ids].sort((a, b) =>
    (order.get(a) ?? 0) - (order.get(b) ?? 0)
    || (a < b ? -1 : a > b ? 1 : 0));
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
  const fp = (id: string): FoursomePlayer => toFoursomePlayer(id, byId);

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

function toFoursomePlayer(id: string, byId: Map<string, EnginePlayer>): FoursomePlayer {
  const player = byId.get(id)!;
  return {
    playerId: id,
    skillLevel: player.skillLevel,
    ...(player.balanceRating === undefined ? {} : { balanceRating: player.balanceRating }),
  };
}


/**
 * How much history a group already shares — lower means fresher matchups.
 * O(n²) over the group, cheap enough to score every candidate line-up.
 */
function groupFamiliarity(s: EngineState, ids: string[], byId: Map<string, EnginePlayer>, w: Weights): number {
  if (ids.length === PLAYERS_PER_MATCH) {
    return foursomePenalty(s, ids.map((id) => toFoursomePlayer(id, byId)), w);
  }

  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i]!, ids[j]!);
      total += w.repeatPartner * (s.partnerCount.get(key) ?? 0)
             + w.repeatOpponent * (s.opponentCount.get(key) ?? 0);
    }
  }
  return total;
}

/** Ceiling on how many line-ups we will score before falling back to seeded order. */
const MAX_LINEUP_CANDIDATES = 3000;

function chooseCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) {
    out = (out * (n - i)) / (i + 1);
    if (out > MAX_LINEUP_CANDIDATES) return Number.POSITIVE_INFINITY;
  }
  return Math.round(out);
}

/**
 * Decide who plays this round.
 *
 * Sit-out fairness fixes most of this, but it routinely leaves a tie — in
 * continuous play every idle player usually has the same sit-out count and
 * games played. Settling that tie on the seeded order (what `selectSitOuts`
 * does) hands the scheduler exactly one court's worth of players and no say in
 * who meets whom, which is what let the same faces keep meeting. Break the tie
 * on shared history instead: among the line-ups fairness permits, take the one
 * whose players have met each other least.
 */
function chooseWhoPlays(
  state: EngineState, available: string[], courtCount: number,
  order: Map<string, number>, roundNumber: number, byId: Map<string, EnginePlayer>,
  w: Weights = DEFAULT_WEIGHTS,
): SitOutResult {
  const plan = planSitOuts(state, available, courtCount, roundNumber);
  const byOrder = (ids: string[]) => sortPlayerIds(ids, order);

  if (plan.remaining <= 0) {
    const sitting = byOrder(plan.mustSit);
    const sittingSet = new Set(sitting);
    return { playing: available.filter((id) => !sittingSet.has(id)), sitting };
  }
  if (plan.remaining >= plan.tied.length) {
    const sitting = byOrder([...plan.mustSit, ...plan.tied]);
    const sittingSet = new Set(sitting);
    return { playing: available.filter((id) => !sittingSet.has(id)), sitting };
  }

  const tied = byOrder(plan.tied);
  // Too many ways to split the tie to score them all — keep the old, cheap rule.
  if (chooseCount(tied.length, plan.remaining) === Number.POSITIVE_INFINITY) {
    const sitting = byOrder([...plan.mustSit, ...tied.slice(0, plan.remaining)]);
    const sittingSet = new Set(sitting);
    return { playing: available.filter((id) => !sittingSet.has(id)), sitting };
  }

  // Both halves matter. The line-up is who meets now; the sitters are who meet
  // next, because the shield sends them back on together and in continuous play
  // only one court frees at a time.
  const scoreSitters = (sitters: string[]) => {
    const sittingSet = new Set(sitters);
    const lineup = available.filter((id) => !sittingSet.has(id));
    return groupFamiliarity(state, lineup, byId, w) + groupFamiliarity(state, sitters, byId, w);
  };

  const search = (fixed: string[], from: string[], take: number) => {
    let bestSitters: string[] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const pick = (start: number, chosen: string[]) => {
      if (chosen.length === take) {
        const sitters = [...fixed, ...chosen];
        const score = scoreSitters(sitters);
        if (score < bestScore) {        // ties keep the first, i.e. seeded order
          bestScore = score;
          bestSitters = sitters;
        }
        return;
      }
      for (let i = start; i < from.length; i++) pick(i + 1, [...chosen, from[i]!]);
    };
    pick(0, []);
    return bestSitters === null ? null : { sitters: bestSitters as string[], score: bestScore };
  };

  const strict = search(plan.mustSit, tied, plan.remaining);

  // Spending a sit-out: one player already past the fair line takes another,
  // freeing a seat for someone who would otherwise have sat. Only worth it if
  // it buys more than a whole repeated partnership's worth of freshness —
  // otherwise fairness wins and nothing is spent.
  let best = strict;
  if (strict && plan.relaxed.length > 0) {
    for (const candidate of byOrder(plan.relaxed)) {
      // Drop the sitter who is least owed a rest to make room for `candidate`.
      const droppable = plan.remaining >= 1 ? null : plan.mustSit[plan.mustSit.length - 1] ?? null;
      const fixed = droppable === null
        ? plan.mustSit
        : plan.mustSit.filter((id) => id !== droppable);
      const take = Math.max(0, plan.remaining - 1);
      const relaxedBest = search([...fixed, candidate], tied, take);
      if (relaxedBest && strict.score - relaxedBest.score >= w.repeatPartner) {
        if (!best || relaxedBest.score < best.score) best = relaxedBest;
      }
    }
  }

  const sitting = byOrder(best ? best.sitters : [...plan.mustSit, ...tied.slice(0, plan.remaining)]);
  const sittingSet = new Set(sitting);
  return { playing: available.filter((id) => !sittingSet.has(id)), sitting };
}
