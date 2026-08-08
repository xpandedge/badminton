import { getFirestore } from "firebase-admin/firestore";
import type { LockedMatch } from "@picklebaddies/match-engine";
import { deriveWinner, type ScoringMode } from "@picklebaddies/domain";

export interface LockedMatchFull extends LockedMatch {
  matchId: string;
  status: "completed" | "in_progress";
  scorePayload?: any;
  winnerTeam?: "A" | "B";
  teamAIds: [string, string];
  teamBIds: [string, string];
}

export interface LockedCounts {
  completed: number;
  inProgress: number;
}

export interface CollectLockedResult {
  lockedMatches: LockedMatch[];
  lockedFull: LockedMatchFull[];
  counts: LockedCounts;
}

/** PRD §14.9 step 1–2: collect all completed + in_progress matches as locked constraints. */
export async function collectLockedMatches(sessionId: string): Promise<CollectLockedResult> {
  const db = getFirestore();
  const roundsSnap = await db.collection(`sessions/${sessionId}/rounds`).get();

  const allMatchFetches = roundsSnap.docs.map((rDoc) =>
    db.collection(`sessions/${sessionId}/rounds/${rDoc.id}/matches`).get()
  );
  const matchSnaps = await Promise.all(allMatchFetches);

  const lockedFull: LockedMatchFull[] = [];
  let completed = 0;
  let inProgress = 0;

  for (const snap of matchSnaps) {
    for (const mDoc of snap.docs) {
      const m = mDoc.data();
      if (m.status !== "completed" && m.status !== "in_progress") continue;

      const teamAIds: [string, string] = m.teamAIds || [m.teamA[0]?.playerId, m.teamA[1]?.playerId];
      const teamBIds: [string, string] = m.teamBIds || [m.teamB[0]?.playerId, m.teamB[1]?.playerId];

      lockedFull.push({
        matchId: mDoc.id,
        status: m.status,
        roundNumber: m.roundNumber,
        courtId: m.courtId,
        teamA: teamAIds,
        teamB: teamBIds,
        teamAIds,
        teamBIds,
        scorePayload: m.scorePayload,
        winnerTeam: m.winnerTeam,
      });

      if (m.status === "completed") completed++;
      else inProgress++;
    }
  }

  const lockedMatches: LockedMatch[] = lockedFull.map((m) => ({
    roundNumber: m.roundNumber,
    courtId: m.courtId,
    teamA: m.teamA,
    teamB: m.teamB,
  }));

  return { lockedMatches, lockedFull, counts: { completed, inProgress } };
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  sitOutCount: number;
}

/** PRD §14.9 step 3: recompute per-player stats from completed matches only. */
export function recomputeStatsFromLocked(
  lockedFull: LockedMatchFull[],
  scoringMode: ScoringMode
): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();

  const get = (pid: string): PlayerStats =>
    stats.get(pid) ?? { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, sitOutCount: 0 };

  for (const m of lockedFull) {
    if (m.status !== "completed") continue;

    // F-M3: a completed match always credits gamesPlayed to its participants.
    // Win/loss/points are only applied when a valid score is present; a
    // score-less completed match is anomalous, so warn rather than silently drop.
    let winnerTeam: "A" | "B" | null = null;
    if (m.scorePayload) {
      try {
        winnerTeam = deriveWinner(m.scorePayload, scoringMode);
      } catch {
        winnerTeam = null;
      }
    }
    if (winnerTeam === null) {
      console.warn(`recomputeStatsFromLocked: completed match ${m.matchId} has no valid score; crediting games only.`);
      for (const pid of [...m.teamAIds, ...m.teamBIds]) {
        const s = get(pid);
        stats.set(pid, { ...s, gamesPlayed: s.gamesPlayed + 1 });
      }
      continue;
    }

    const pFor = (isTeamA: boolean) =>
      scoringMode === "points"
        ? (isTeamA ? m.scorePayload.teamAScore : m.scorePayload.teamBScore) ?? 0
        : 0;
    const pAgainst = (isTeamA: boolean)  =>
      scoringMode === "points"
        ? (isTeamA ? m.scorePayload.teamBScore : m.scorePayload.teamAScore) ?? 0
        : 0;

    for (const pid of m.teamAIds) {
      const s = get(pid);
      const isWin = winnerTeam === "A";
      const pf = pFor(true);
      const pa = pAgainst(true);
      stats.set(pid, {
        ...s,
        gamesPlayed: s.gamesPlayed + 1,
        wins: s.wins + (isWin ? 1 : 0),
        losses: s.losses + (isWin ? 0 : 1),
        pointsFor: s.pointsFor + pf,
        pointsAgainst: s.pointsAgainst + pa,
        pointDifference: s.pointDifference + (pf - pa),
        sitOutCount: s.sitOutCount,
      });
    }

    for (const pid of m.teamBIds) {
      const s = get(pid);
      const isWin = winnerTeam === "B";
      const pf = pFor(false);
      const pa = pAgainst(false);
      stats.set(pid, {
        ...s,
        gamesPlayed: s.gamesPlayed + 1,
        wins: s.wins + (isWin ? 1 : 0),
        losses: s.losses + (isWin ? 0 : 1),
        pointsFor: s.pointsFor + pf,
        pointsAgainst: s.pointsAgainst + pa,
        pointDifference: s.pointDifference + (pf - pa),
        sitOutCount: s.sitOutCount,
      });
    }
  }

  return stats;
}
