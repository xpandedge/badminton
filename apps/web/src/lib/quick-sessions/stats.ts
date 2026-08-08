// apps/web/src/lib/quick-sessions/stats.ts
import type { GeneratedMatch, GeneratedSitOut } from "@picklebaddies/match-engine";

export interface SessionDelta {
  gamesPerPlayer: Map<string, number>;
  sitOutsPerPlayer: Map<string, number>;
  partnerCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function inc(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}

export function computeSessionDelta(
  matches: GeneratedMatch[],
  sitOuts: GeneratedSitOut[]
): SessionDelta {
  const gamesPerPlayer = new Map<string, number>();
  const sitOutsPerPlayer = new Map<string, number>();
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();

  for (const m of matches) {
    for (const id of [...m.teamA, ...m.teamB]) inc(gamesPerPlayer, id);
    inc(partnerCounts, pairKey(m.teamA[0], m.teamA[1]));
    inc(partnerCounts, pairKey(m.teamB[0], m.teamB[1]));
    for (const a of m.teamA) for (const b of m.teamB) inc(opponentCounts, pairKey(a, b));
  }

  for (const s of sitOuts) inc(sitOutsPerPlayer, s.playerId);

  return { gamesPerPlayer, sitOutsPerPlayer, partnerCounts, opponentCounts };
}
