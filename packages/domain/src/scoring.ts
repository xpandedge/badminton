export type ScoringMode = "winner_only" | "points";
export const SCORING_MODES: readonly ScoringMode[] = ["winner_only", "points"];

export type ScorePayload = { teamAScore: number; teamBScore: number } | { winnerTeam: "A" | "B" };

export function deriveWinner(payload: ScorePayload, mode: ScoringMode): "A" | "B" {
  if (mode === "points") {
    if (!("teamAScore" in payload)) throw new Error("points mode requires scores");
    if (payload.teamAScore === payload.teamBScore) throw new Error("ties are not allowed");
    return payload.teamAScore > payload.teamBScore ? "A" : "B";
  }
  if (!("winnerTeam" in payload)) throw new Error("winner_only mode requires winnerTeam");
  return payload.winnerTeam;
}

export interface LeaderboardRow {
  wins: number;
  pointDifference: number;
  gamesPlayed: number;
  sitOutCount: number;
  /** Final, deterministic tie-break (DELTA_SPEC D1). Optional for back-compat. */
  displayName?: string;
}

/**
 * Returns >0 if b ranks ahead of a (sort comparator semantics).
 * DELTA_SPEC D1 tiebreakers:
 *   points:      wins → pointDifference → gamesPlayed → displayName
 *   winner_only: wins → gamesPlayed → fewer sitOuts → displayName
 */
export function leaderboardCompare(a: LeaderboardRow, b: LeaderboardRow, mode: ScoringMode): number {
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
