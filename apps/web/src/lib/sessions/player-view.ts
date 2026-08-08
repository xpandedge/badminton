export interface PlayerMatchInfo {
  currentMatch: any | null;
  nextMatch: any | null;
  waiting: boolean;
}

export function findPlayerMatch(matches: any[], currentRoundNumber: number, playerId: string): PlayerMatchInfo {
  const currentMatches = matches.filter(m => m.roundNumber === currentRoundNumber);
  const futureMatches = matches.filter(m => m.roundNumber > currentRoundNumber);

  const isInMatch = (m: any) =>
    m.teamA?.some((p: any) => p.playerId === playerId) ||
    m.teamB?.some((p: any) => p.playerId === playerId);

  const currentMatch = currentMatches.find(isInMatch) || null;

  const nextMatchesForPlayer = futureMatches.filter(isInMatch).sort((a, b) => a.roundNumber - b.roundNumber);
  const nextMatch = nextMatchesForPlayer[0] || null;

  const waiting = !currentMatch;

  return { currentMatch, nextMatch, waiting };
}
