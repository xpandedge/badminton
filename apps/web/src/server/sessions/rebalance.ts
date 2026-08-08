"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import {
  canGenerateSchedule,
  buildRebalanceSummary,
  deriveWinner,
  type ScoringMode,
} from "@picklebaddies/domain";
import { generateSchedule as engineGenerateSchedule, type LockedMatch } from "@picklebaddies/match-engine";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { mapSessionToEngineInput } from "@/server/lib/mapping";

type RebalanceTrigger = "manual_rebalance" | "player_added" | "player_removed" | "settings_changed";

export interface RebalanceResult {
  summary: string;
  metadata: unknown;
}

/**
 * Rebalance future rounds, preserving locked (completed/in-progress) matches.
 *
 * F-C3: all reads happen inside a single transaction snapshot before any write,
 * so a concurrent score submission cannot cause double-counting.
 * D4: elapsedRounds = completed + in-progress rounds — single source for every
 * delete/write boundary and for the engine (F-H1/F-H2).
 */
export async function rebalanceSession(
  sessionId: string,
  trigger: RebalanceTrigger = "manual_rebalance",
): Promise<ActionResult<RebalanceResult>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId) return err("INVALID_ARGUMENT", "sessionId is required");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);

  try {
    const result = await db.runTransaction(async (t) => {
      // ─────────────────────── ALL READS FIRST (F-C3) ──────────────────────
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canGenerateSchedule(role)) {
        throw Object.assign(new Error("Must be a squad member to rebalance"), { code: "FORBIDDEN" });
      }

      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(
          new Error("Session must be active or paused to rebalance"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      const playersSnap = await t.get(db.collection(`sessions/${sessionId}/players`));
      const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const roundsSnap = await t.get(db.collection(`sessions/${sessionId}/rounds`));
      const rounds = roundsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const matchesByRound = await Promise.all(
        roundsSnap.docs.map((rDoc) => t.get(db.collection(`sessions/${sessionId}/rounds/${rDoc.id}/matches`))),
      );
      const allMatches = matchesByRound.flatMap((snap) =>
        snap.docs.map((m) => ({ id: m.id, ref: m.ref, ...(m.data() as any) })),
      );

      const sitOutsSnap = await t.get(db.collection(`sessions/${sessionId}/sitOuts`));

      // ──────────────────────── COMPUTE (pure) ─────────────────────────────
      // D4: elapsed = completed + in-progress rounds
      const elapsedRounds = rounds.filter(
        (r) => r.status === "completed" || r.status === "in_progress",
      ).length;

      // Only completed matches feed locked constraints (cancelled ≠ played)
      const completedMatches = allMatches.filter((m) => m.status === "completed");
      const inProgressCount = allMatches.filter((m) => m.status === "in_progress").length;

      const lockedFull: LockedMatchFull[] = completedMatches.map((m) => {
        const teamAIds = (m.teamAIds || m.teamA.map((p: any) => p.playerId)) as [string, string];
        const teamBIds = (m.teamBIds || m.teamB.map((p: any) => p.playerId)) as [string, string];
        return {
          matchId: m.id, status: "completed" as const,
          roundNumber: m.roundNumber, courtId: m.courtId,
          teamA: teamAIds, teamB: teamBIds, teamAIds, teamBIds,
          scorePayload: m.scorePayload, winnerTeam: m.winnerTeam,
        };
      });
      const lockedMatches: LockedMatch[] = lockedFull.map((m) => ({
        roundNumber: m.roundNumber, courtId: m.courtId, teamA: m.teamA, teamB: m.teamB,
      }));

      const recomputedStats = recomputeStatsFromLocked(lockedFull, session.scoringMode as ScoringMode);

      const sitOutCounts = new Map<string, number>();
      for (const sDoc of sitOutsSnap.docs) {
        const d = sDoc.data() as any;
        if (d.roundNumber <= elapsedRounds) {
          sitOutCounts.set(d.playerId, (sitOutCounts.get(d.playerId) ?? 0) + 1);
        }
      }

      const engineInput = mapSessionToEngineInput(session, players, rounds, [], "rebalance");
      engineInput.lockedMatches = lockedMatches;
      engineInput.elapsedRounds = elapsedRounds;

      const engineOutput = engineGenerateSchedule(engineInput);

      const removedPlayers = players.filter(
        (p) => p.status === "left" || p.status === "removed" || p.status === "no_show",
      );
      const lateJoiners = players.filter((p) => p.availableFromRound && p.availableFromRound > 1);

      // ─────────────────────────────── WRITES ──────────────────────────────
      // 1. Reconcile all player stats from locked snapshot (corrects drift)
      const zero = { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
      for (const p of players) {
        const base = recomputedStats.get(p.id) ?? { ...zero, sitOutCount: 0 };
        const sitOutCount = sitOutCounts.get(p.id) ?? 0;
        const playerStats = { ...base, sitOutCount };
        t.set(db.doc(`sessions/${sessionId}/players/${p.id}`), playerStats, { merge: true });
        t.set(db.doc(`sessions/${sessionId}/leaderboard/${p.id}`), { ...playerStats, displayName: p.displayName }, { merge: true });
      }

      // 2. Delete future scheduled rounds, their matches, and future sit-outs
      for (let i = 0; i < roundsSnap.docs.length; i++) {
        const rDoc = roundsSnap.docs[i]!;
        const roundData = rounds[i]!;
        if (roundData.roundNumber <= elapsedRounds || roundData.status !== "scheduled") continue;
        for (const mDoc of matchesByRound[i]!.docs) {
          if ((mDoc.data() as any).status === "scheduled") t.delete(mDoc.ref);
        }
        t.delete(rDoc.ref);
      }
      for (const sDoc of sitOutsSnap.docs) {
        if ((sDoc.data() as any).roundNumber > elapsedRounds) t.delete(sDoc.ref);
      }

      // 3. Write regenerated future rounds/matches/sit-outs
      const displayName = (pid: string) => players.find((p) => p.id === pid)?.displayName ?? "Unknown";
      const roundRefs = new Map<number, FirebaseFirestore.DocumentReference>();
      for (const match of engineOutput.matches) {
        if (match.roundNumber <= elapsedRounds) continue;
        let rRef = roundRefs.get(match.roundNumber);
        if (!rRef) {
          rRef = db.doc(`sessions/${sessionId}/rounds/round_${match.roundNumber}`);
          roundRefs.set(match.roundNumber, rRef);
          t.set(rRef, { roundNumber: match.roundNumber, status: "scheduled" });
        }
        const mRef = rRef.collection("matches").doc();
        t.set(mRef, {
          roundNumber: match.roundNumber,
          courtId: match.courtId,
          matchNumber: match.matchNumber,
          teamA: match.teamA.map((pid) => ({ playerId: pid, displayName: displayName(pid) })),
          teamB: match.teamB.map((pid) => ({ playerId: pid, displayName: displayName(pid) })),
          teamAIds: match.teamA,
          teamBIds: match.teamB,
          status: "scheduled",
          isLocked: false,
          sessionId,
        });
      }
      for (const sitOut of engineOutput.sitOuts) {
        if (sitOut.roundNumber <= elapsedRounds) continue;
        t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
      }

      // 4. Generation run + audit
      t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
        mode: "rebalance",
        trigger,
        metadata: engineOutput.metadata,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "generation/rebalanced",
        details: { trigger, metadata: engineOutput.metadata },
        createdAt: FieldValue.serverTimestamp(),
      });

      const summary = buildRebalanceSummary({
        completedPreserved: completedMatches.length,
        inProgressPreserved: inProgressCount,
        removed: removedPlayers.map((p) => p.displayName),
        addedFromRound: lateJoiners.map((p) => ({ name: p.displayName, round: p.availableFromRound })),
        minGames: (engineOutput.metadata as any).minGamesPerPlayer,
        maxGames: (engineOutput.metadata as any).maxGamesPerPlayer,
      });

      return { summary, metadata: engineOutput.metadata };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }
}

// ── Inline: recomputeStatsFromLocked (ported from functions/src/lib/locked.ts) ──

interface LockedMatchFull extends LockedMatch {
  matchId: string;
  status: "completed" | "in_progress";
  scorePayload?: any;
  winnerTeam?: "A" | "B";
  teamAIds: [string, string];
  teamBIds: [string, string];
}

interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  sitOutCount: number;
}

function recomputeStatsFromLocked(
  lockedFull: LockedMatchFull[],
  scoringMode: ScoringMode,
): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();
  const get = (pid: string): PlayerStats =>
    stats.get(pid) ?? { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0, sitOutCount: 0 };

  for (const m of lockedFull) {
    if (m.status !== "completed") continue;

    let winnerTeam: "A" | "B" | null = null;
    if (m.scorePayload) {
      try { winnerTeam = deriveWinner(m.scorePayload, scoringMode); } catch { winnerTeam = null; }
    }

    if (winnerTeam === null) {
      for (const pid of [...m.teamAIds, ...m.teamBIds]) {
        const s = get(pid);
        stats.set(pid, { ...s, gamesPlayed: s.gamesPlayed + 1 });
      }
      continue;
    }

    for (const isTeamA of [true, false] as const) {
      const ids = isTeamA ? m.teamAIds : m.teamBIds;
      for (const pid of ids) {
        const s = get(pid);
        const isWin = winnerTeam === (isTeamA ? "A" : "B");
        const pf = scoringMode === "points" ? (isTeamA ? m.scorePayload?.teamAScore : m.scorePayload?.teamBScore) ?? 0 : 0;
        const pa = scoringMode === "points" ? (isTeamA ? m.scorePayload?.teamBScore : m.scorePayload?.teamAScore) ?? 0 : 0;
        stats.set(pid, {
          ...s,
          gamesPlayed: s.gamesPlayed + 1,
          wins: s.wins + (isWin ? 1 : 0),
          losses: s.losses + (isWin ? 0 : 1),
          pointsFor: s.pointsFor + pf,
          pointsAgainst: s.pointsAgainst + pa,
          pointDifference: s.pointDifference + (pf - pa),
        });
      }
    }
  }

  return stats;
}
