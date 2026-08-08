// apps/web/src/lib/quick-sessions/score.ts
import type { GeneratedMatch } from "@picklebaddies/match-engine";
import type { QuickScore, RoundStatus } from "./types";

export function computeMatchKey(roundNumber: number, courtId: string): string {
  return `r${roundNumber}_${courtId}`;
}

export function getWinner(teamAScore: number, teamBScore: number): "a" | "b" | null {
  if (teamAScore === teamBScore) return null;
  return teamAScore > teamBScore ? "a" : "b";
}

export function computeRoundStatus(
  roundNumber: number,
  allMatches: GeneratedMatch[],
  scores: Record<string, QuickScore>
): RoundStatus {
  const roundMatches = allMatches.filter((m) => m.roundNumber === roundNumber);
  const allScored = roundMatches.every((m) => scores[computeMatchKey(m.roundNumber, m.courtId)] !== undefined);
  if (allScored) return "done";

  const prevRoundsAllDone = allMatches
    .filter((m) => m.roundNumber < roundNumber)
    .every((m) => scores[computeMatchKey(m.roundNumber, m.courtId)] !== undefined);

  return prevRoundsAllDone ? "playing" : "up_next";
}
