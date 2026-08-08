// apps/web/src/lib/quick-sessions/leaderboard.ts
import type { QuickSession } from "./types";
import { computeMatchKey, getWinner } from "./score";

export interface SessionPlayerRow {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winPct: number; // 0–100, NaN if games === 0
  sitOuts: number;
}

export function computeSessionLeaderboard(session: QuickSession): SessionPlayerRow[] {
  const rowMap = new Map<string, SessionPlayerRow>();

  for (const p of session.players) {
    rowMap.set(p.id, { playerId: p.id, name: p.name, games: 0, wins: 0, losses: 0, winPct: NaN, sitOuts: 0 });
  }

  for (const match of session.matches) {
    const key = computeMatchKey(match.roundNumber, match.courtId);
    const score = session.scores[key];
    if (!score) continue;

    const winner = getWinner(score.teamAScore, score.teamBScore);
    if (!winner) continue;

    for (const playerId of match.teamA) {
      const row = rowMap.get(playerId);
      if (!row) continue;
      row.games++;
      if (winner === "a") row.wins++; else row.losses++;
    }
    for (const playerId of match.teamB) {
      const row = rowMap.get(playerId);
      if (!row) continue;
      row.games++;
      if (winner === "b") row.wins++; else row.losses++;
    }
  }

  for (const sitOut of session.sitOuts) {
    const row = rowMap.get(sitOut.playerId);
    if (row) row.sitOuts++;
  }

  for (const row of rowMap.values()) {
    row.winPct = row.games > 0 ? (row.wins / row.games) * 100 : NaN;
  }

  return [...rowMap.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aPct = isNaN(a.winPct) ? -1 : a.winPct;
    const bPct = isNaN(b.winPct) ? -1 : b.winPct;
    if (bPct !== aPct) return bPct - aPct;
    return a.name.localeCompare(b.name);
  });
}
