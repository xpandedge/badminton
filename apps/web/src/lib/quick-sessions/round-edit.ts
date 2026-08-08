import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

type Position =
  | { kind: "match"; matchIdx: number; team: "teamA" | "teamB"; slot: 0 | 1 }
  | { kind: "sitout"; sitIdx: number };

function findPosition(
  id: string,
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[]
): Position | null {
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const ai = m.teamA.indexOf(id);
    if (ai !== -1) return { kind: "match", matchIdx: i, team: "teamA", slot: ai as 0 | 1 };
    const bi = m.teamB.indexOf(id);
    if (bi !== -1) return { kind: "match", matchIdx: i, team: "teamB", slot: bi as 0 | 1 };
  }
  const si = sitOuts.findIndex((s) => s.playerId === id);
  if (si !== -1) return { kind: "sitout", sitIdx: si };
  return null;
}

export function swapPlayersInRound(
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[],
  playerA: string,
  playerB: string
): { matches: GeneratedMatch[]; sitOuts: GeneratedSitOut[] } {
  const posA = findPosition(playerA, matches, sitOuts);
  const posB = findPosition(playerB, matches, sitOuts);
  if (!posA || !posB) return { matches, sitOuts };

  const newMatches = matches.map((m) => ({
    ...m,
    teamA: [...m.teamA] as [string, string],
    teamB: [...m.teamB] as [string, string],
  }));
  const newSitOuts = sitOuts.map((s) => ({ ...s }));

  // Place playerB where playerA was
  if (posA.kind === "match") {
    newMatches[posA.matchIdx]![posA.team][posA.slot] = playerB;
  } else {
    newSitOuts[posA.sitIdx]!.playerId = playerB;
  }

  // Place playerA where playerB was
  if (posB.kind === "match") {
    newMatches[posB.matchIdx]![posB.team][posB.slot] = playerA;
  } else {
    newSitOuts[posB.sitIdx]!.playerId = playerA;
  }

  return { matches: newMatches, sitOuts: newSitOuts };
}
