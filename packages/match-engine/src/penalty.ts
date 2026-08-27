import { balanceRatingFromSkill, type SkillLevel } from "./types.js";
import { pairKey, type EngineState } from "./state.js";

export interface Weights {
  repeatPartner: number; repeatOpponent: number; recentPartner: number;
  recentOpponent: number; skillGap: number;
}
export const DEFAULT_WEIGHTS: Weights = {
  repeatPartner: 10, repeatOpponent: 4, recentPartner: 6, recentOpponent: 3, skillGap: 1,
};

export interface FoursomePlayer { playerId: string; skillLevel: SkillLevel; balanceRating?: number; }
export type TeamSplit = { teamA: [string, string]; teamB: [string, string]; penalty: number };

const splits: ReadonlyArray<[number, number, number, number]> = [
  [0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2], // 3 distinct doubles pairings of 4 players
];

function playerBalanceRating(player: FoursomePlayer): number {
  return Number.isFinite(player.balanceRating) && player.balanceRating! > 0
    ? player.balanceRating!
    : balanceRatingFromSkill(player.skillLevel);
}

function teamStrength(a: FoursomePlayer, b: FoursomePlayer): number {
  return playerBalanceRating(a) + playerBalanceRating(b);
}

/** Penalty of a specific team split given history (PRD §14.6 soft terms). */
function splitPenalty(s: EngineState, p: FoursomePlayer[], idx: [number, number, number, number], w: Weights): number {
  const [a1, a2, b1, b2] = idx.map((i) => p[i]!) as [FoursomePlayer, FoursomePlayer, FoursomePlayer, FoursomePlayer];
  let pen = 0;
  pen += w.repeatPartner * ((s.partnerCount.get(pairKey(a1.playerId, a2.playerId)) ?? 0)
                          + (s.partnerCount.get(pairKey(b1.playerId, b2.playerId)) ?? 0));
  if (s.lastPartner.get(a1.playerId) === a2.playerId) pen += w.recentPartner;
  if (s.lastPartner.get(b1.playerId) === b2.playerId) pen += w.recentPartner;
  for (const a of [a1, a2]) for (const b of [b1, b2]) {
    pen += w.repeatOpponent * (s.opponentCount.get(pairKey(a.playerId, b.playerId)) ?? 0);
    if (s.lastOpponents.get(a.playerId)?.has(b.playerId)) pen += w.recentOpponent;
  }
  const teamA = teamStrength(a1, a2);
  const teamB = teamStrength(b1, b2);
  pen += w.skillGap * (Math.abs(teamA - teamB) / 100);
  return pen;
}

export function bestTeamSplit(s: EngineState, four: FoursomePlayer[], w: Weights = DEFAULT_WEIGHTS): TeamSplit {
  let best: TeamSplit | null = null;
  for (const idx of splits) {
    const penalty = splitPenalty(s, four, idx, w);
    if (!best || penalty < best.penalty) {
      const [a1, a2, b1, b2] = idx;
      best = { teamA: [four[a1]!.playerId, four[a2]!.playerId], teamB: [four[b1]!.playerId, four[b2]!.playerId], penalty };
    }
  }
  return best!;
}

/** Penalty of grouping 4 arbitrary players together (min over their 3 splits). */
export function foursomePenalty(s: EngineState, four: FoursomePlayer[], w: Weights = DEFAULT_WEIGHTS): number {
  return bestTeamSplit(s, four, w).penalty;
}
