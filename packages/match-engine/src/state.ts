import type { EnginePlayer, LockedMatch } from "./types.js";

export interface EngineState {
  gamesPlayed: Map<string, number>;
  sitOuts: Map<string, number>;
  /** lastSitOutRound: tracks the most recent round in which each player sat out.
   *  Used by the Hard Sit-Out Shield to detect and prevent consecutive sit-outs. */
  lastSitOutRound: Map<string, number>;
  partnerCount: Map<string, number>;   // pairKey -> times partnered
  opponentCount: Map<string, number>;  // pairKey -> times opposed
  lastPartner: Map<string, string>;    // playerId -> partner in previous round
  lastOpponents: Map<string, Set<string>>;
  lastPlayedRound: Map<string, number>;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function createInitialState(players: EnginePlayer[]): EngineState {
  const s: EngineState = {
    gamesPlayed: new Map(), sitOuts: new Map(), lastSitOutRound: new Map(),
    partnerCount: new Map(), opponentCount: new Map(), lastPartner: new Map(),
    lastOpponents: new Map(), lastPlayedRound: new Map(),
  };
  for (const p of players) { s.gamesPlayed.set(p.playerId, 0); s.sitOuts.set(p.playerId, 0); }
  return s;
}

const inc = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

/** Apply a played match to state (used both for seeding from locked and during build). */
export function recordMatch(
  s: EngineState, roundNumber: number, teamA: [string, string], teamB: [string, string],
): void {
  for (const id of [...teamA, ...teamB]) { inc(s.gamesPlayed, id); s.lastPlayedRound.set(id, roundNumber); }
  inc(s.partnerCount, pairKey(teamA[0], teamA[1]));
  inc(s.partnerCount, pairKey(teamB[0], teamB[1]));
  for (const a of teamA) for (const b of teamB) inc(s.opponentCount, pairKey(a, b));
  s.lastPartner.set(teamA[0], teamA[1]); s.lastPartner.set(teamA[1], teamA[0]);
  s.lastPartner.set(teamB[0], teamB[1]); s.lastPartner.set(teamB[1], teamB[0]);
  s.lastOpponents.set(teamA[0], new Set(teamB)); s.lastOpponents.set(teamA[1], new Set(teamB));
  s.lastOpponents.set(teamB[0], new Set(teamA)); s.lastOpponents.set(teamB[1], new Set(teamA));
}

/** Record a sit-out for a player in a given round, updating lastSitOutRound. */
export function recordSitOut(s: EngineState, playerId: string, roundNumber: number): void {
  s.sitOuts.set(playerId, (s.sitOuts.get(playerId) ?? 0) + 1);
  s.lastSitOutRound.set(playerId, roundNumber);
}

export function seedStateFromLocked(players: EnginePlayer[], locked: LockedMatch[]): EngineState {
  const s = createInitialState(players);
  for (const m of [...locked].sort((a, b) => a.roundNumber - b.roundNumber)) {
    recordMatch(s, m.roundNumber, m.teamA, m.teamB);
  }
  return s;
}