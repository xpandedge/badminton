"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule, buildRebalanceSummary, deriveWinner, type ScoringMode } from "@picklebaddies/domain";
import { buildRound, seedStateFromLocked, seededOrder, DEFAULT_SEED, type LockedMatch } from "@picklebaddies/match-engine";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { toEnginePlayers, toEngineCourts, buildMatchDocs, serializeEngineState } from "./scheduling";

type RebalanceTrigger = "manual_rebalance" | "player_added" | "player_removed" | "settings_changed";

export interface RebalanceResult {
  summary: string;
}

/**
 * Continuous scheduling has at most ONE not-yet-started match per court at any
 * time (no batch of future rounds to discard). Rebalancing means: cancel every
 * currently-scheduled (not yet started) match, freeing those courts, then
 * re-pick matches for all now-idle players against a freshly-rebuilt fairness
 * state (rebuilt from completed matches only, so a cancelled match's
 * provisional stat contribution is correctly discarded). Completed matches and
 * their stats are never touched.
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
      // ── ALL READS FIRST ──
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canGenerateSchedule(role)) {
        throw Object.assign(new Error("Must be a squad member to rebalance"), { code: "FORBIDDEN" });
      }
      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(new Error("Session must be active or paused to rebalance"), { code: "FAILED_PRECONDITION" });
      }

      const [playersSnap, matchesSnap] = await Promise.all([
        t.get(db.collection(`sessions/${sessionId}/players`)),
        t.get(db.collection(`sessions/${sessionId}/matches`)),
      ]);
      const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const matches = matchesSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));

      // ── COMPUTE ──
      const completedMatches = matches.filter((m) => m.status === "completed");
      const scheduledMatches = matches.filter((m) => m.status === "scheduled");

      const lockedFull: LockedMatchFull[] = completedMatches.map((m) => {
        const teamAIds = (m.teamAIds || m.teamA.map((p: any) => p.playerId)) as [string, string];
        const teamBIds = (m.teamBIds || m.teamB.map((p: any) => p.playerId)) as [string, string];
        return {
          matchId: m.id, roundNumber: m.roundNumber, courtId: m.courtId,
          teamA: teamAIds, teamB: teamBIds, teamAIds, teamBIds,
          scorePayload: m.scorePayload, winnerTeam: m.winnerTeam,
        };
      });
      const lockedMatches: LockedMatch[] = lockedFull.map((m) => ({
        roundNumber: m.roundNumber, courtId: m.courtId, teamA: m.teamA, teamB: m.teamB,
      }));

      const recomputedStats = recomputeStatsFromLocked(lockedFull, session.scoringMode as ScoringMode);

      const enginePlayers = toEnginePlayers(players);
      const engineCourts = toEngineCourts(session.courts || []);
      // Rebuild fairness state from completed matches only — discards any
      // provisional contribution the about-to-be-cancelled matches made.
      const state = seedStateFromLocked(enginePlayers, lockedMatches);
      const order = seededOrder(enginePlayers.map((p) => p.playerId), DEFAULT_SEED);
      const cycle = session.nextCycleNumber || 2;

      // Every court is idle after cancellation (no in-progress state exists —
      // matches go straight scheduled -> completed/cancelled in this app).
      const { matches: newMatches, sitOuts: newSitOuts } = buildRound(state, enginePlayers, engineCourts, cycle, order);

      const removedPlayers = players.filter((p) => p.status === "left" || p.status === "removed" || p.status === "no_show");

      // ── WRITES ──
      const zero = { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
      for (const p of players) {
        const base = recomputedStats.get(p.id) ?? { ...zero, sitOutCount: 0 };
        t.set(db.doc(`sessions/${sessionId}/players/${p.id}`), base, { merge: true });
        t.set(db.doc(`sessions/${sessionId}/leaderboard/${p.id}`), { ...base, displayName: p.displayName }, { merge: true });
      }

      for (const m of scheduledMatches) {
        t.update(m.ref, { status: "cancelled", isLocked: true });
      }

      const nameById = new Map(players.map((p: any) => [p.id, p.displayName ?? "Player"]));
      const courtNameById = new Map(engineCourts.map((c) => [c.courtId, c.name]));
      for (const doc of buildMatchDocs(sessionId, nameById, newMatches, courtNameById)) {
        t.set(db.collection(`sessions/${sessionId}/matches`).doc(), doc);
      }
      for (const sitOut of newSitOuts) {
        t.set(db.collection(`sessions/${sessionId}/sitOuts`).doc(), sitOut);
      }
      t.set(db.doc(`sessions/${sessionId}/engine/state`), serializeEngineState(state));
      t.update(sessionRef, { nextCycleNumber: cycle + 1 });

      t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
        mode: "rebalance",
        trigger,
        matchCount: newMatches.length,
        sitOutCount: newSitOuts.length,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: user.uid,
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "generation/rebalanced",
        details: { trigger, matchCount: newMatches.length },
        createdAt: FieldValue.serverTimestamp(),
      });

      const summary = buildRebalanceSummary({
        completedPreserved: completedMatches.length,
        cancelled: scheduledMatches.length,
        regenerated: newMatches.length,
        removed: removedPlayers.map((p) => p.displayName),
      });

      return { summary };
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
