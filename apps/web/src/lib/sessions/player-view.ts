export interface PlayerMatchInfo {
  currentMatch: any | null;
  waiting: boolean;
}

/**
 * Continuous per-court scheduling: a player has at most one `scheduled` match
 * at a time (their current court assignment), assigned automatically as
 * courts free up (see server/sessions/score.ts) — there's no "next round" to
 * preview since it doesn't exist until generated.
 */
export function findPlayerMatch(matches: any[], playerId: string): PlayerMatchInfo {
  const isInMatch = (m: any) =>
    m.teamA?.some((p: any) => p.playerId === playerId) ||
    m.teamB?.some((p: any) => p.playerId === playerId);

  const currentMatch = matches.find((m) => m.status === "scheduled" && isInMatch(m)) || null;

  return { currentMatch, waiting: !currentMatch };
}
