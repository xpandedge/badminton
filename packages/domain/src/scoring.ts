export type ScoringMode = "winner_only" | "points";
export const SCORING_MODES: readonly ScoringMode[] = ["winner_only", "points"];

export type ScorePayload = { teamAScore: number; teamBScore: number } | { winnerTeam: "A" | "B" };

/**
 * Derives the winner from whatever the payload actually contains — points if
 * given (any mode), otherwise an explicit winner pick. Points are always
 * optional: a match can be finished with just a winner tap, even in a
 * "points" scoring session; `mode` is accepted for API stability but no
 * longer gates which payload shape is required.
 */
export function deriveWinner(payload: ScorePayload, _mode: ScoringMode): "A" | "B" {
  if ("teamAScore" in payload) {
    if (payload.teamAScore === payload.teamBScore) throw new Error("ties are not allowed");
    return payload.teamAScore > payload.teamBScore ? "A" : "B";
  }
  if ("winnerTeam" in payload) return payload.winnerTeam;
  throw new Error("payload must include either scores or a winner");
}

export interface LeaderboardRow {
  wins: number;
  pointDifference: number;
  gamesPlayed: number;
  sitOutCount: number;
  /** Final, deterministic tie-break (DELTA_SPEC D1). Optional for back-compat. */
  displayName?: string;
}

/** Share of games won, in [0,1]. A player with no games scores 0. */
export function winRate(row: Pick<LeaderboardRow, "wins" | "gamesPlayed">): number {
  if (row.gamesPlayed <= 0) return 0;
  return row.wins / row.gamesPlayed;
}

/**
 * Returns >0 if b ranks ahead of a (sort comparator semantics).
 *
 * Standings lead on win rate, not on raw wins, so a player who sits out rounds
 * is not punished for the games they never got. Raw wins is the first
 * tie-break, which keeps the bigger sample ahead at an equal rate.
 * Tiebreakers:
 *   points:      win% → wins → pointDifference → gamesPlayed → displayName
 *   winner_only: win% → wins → gamesPlayed → fewer sitOuts → displayName
 */
export function leaderboardCompare(a: LeaderboardRow, b: LeaderboardRow, mode: ScoringMode): number {
  const aGames = Math.max(0, a.gamesPlayed);
  const bGames = Math.max(0, b.gamesPlayed);
  if (aGames === 0 || bGames === 0) {
    // Nobody who has not played yet outranks somebody who has, whatever their record.
    if (aGames !== bGames) return bGames - aGames;
  } else {
    // Cross-multiplied so equal ratios compare exactly (1/3 vs 2/6), no float drift.
    const byRate = b.wins * aGames - a.wins * bGames;
    if (byRate !== 0) return byRate;
  }
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (mode === "points") {
    if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
  } else {
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    if (a.sitOutCount !== b.sitOutCount) return a.sitOutCount - b.sitOutCount; // fewer sit-outs ranks ahead
  }
  return (a.displayName ?? "").localeCompare(b.displayName ?? "");
}
