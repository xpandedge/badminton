import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { canGenerateSchedule, buildRebalanceSummary } from "@picklebaddies/domain";
import { generateSchedule as engineGenerateSchedule, type LockedMatch } from "@picklebaddies/match-engine";
import { requireGroupRole } from "./lib/auth.js";
import { assertString } from "./lib/validation.js";
import { mapSessionToEngineInput } from "./lib/mapping.js";
import { recomputeStatsFromLocked, type LockedMatchFull } from "./lib/locked.js";
import { writeAudit } from "./lib/audit.js";

type RebalanceTrigger = "manual_rebalance" | "player_added" | "player_removed" | "settings_changed";

/**
 * Rebalance future rounds, preserving locked (completed/in-progress) matches.
 *
 * Fully transactional (F-C3): every read — session, role, players, rounds,
 * matches, sit-outs — happens inside one transaction snapshot before any write,
 * so a concurrent score submission can't cause a now-locked match to be deleted
 * or double-counted. `elapsedRounds` is derived once from round status (D4) and
 * drives the delete boundary, the write boundary, and the engine identically
 * (F-H1/F-H2). The pure engine is invoked between the reads and the writes.
 */
export const rebalanceSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data?.sessionId, "sessionId");
  const trigger = (request.data?.trigger as RebalanceTrigger | undefined) ?? "manual_rebalance";
  const uid = request.auth.uid;

  const db = getFirestore();
  const sessionRef = db.doc(`sessions/${sessionId}`);

  const result = await db.runTransaction(async (t) => {
    // ─────────────────────────── ALL READS FIRST ───────────────────────────
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(uid, session.groupId, canGenerateSchedule, t);

    if (session.status !== "active" && session.status !== "paused") {
      throw new HttpsError("failed-precondition", "Session must be active or paused to rebalance.");
    }

    const playersSnap = await t.get(db.collection(`sessions/${sessionId}/players`));
    const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const roundsSnap = await t.get(db.collection(`sessions/${sessionId}/rounds`));
    const rounds = roundsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Read every round's matches transactionally (consistent snapshot).
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map((rDoc) => t.get(db.collection(`sessions/${sessionId}/rounds/${rDoc.id}/matches`)))
    );
    const allMatches = matchesByRound.flatMap((snap) =>
      snap.docs.map((m) => ({ id: m.id, ref: m.ref, ...(m.data() as any) }))
    );

    const sitOutsSnap = await t.get(db.collection(`sessions/${sessionId}/sitOuts`));

    // ─────────────────────────── COMPUTE (pure) ───────────────────────────
    // D4: elapsed = completed + in-progress rounds. Single source of truth for
    // every boundary below and for the engine.
    const elapsedRounds = rounds.filter(
      (r) => r.status === "completed" || r.status === "in_progress"
    ).length;

    // Locked = matches actually played (completed). Cancelled matches are NOT
    // treated as locked play (they would wrongly bias the engine's history).
    const completedMatches = allMatches.filter((m) => m.status === "completed");
    const inProgressCount = allMatches.filter((m) => m.status === "in_progress").length;

    const lockedFull: LockedMatchFull[] = completedMatches.map((m) => {
      const teamAIds = (m.teamAIds || m.teamA.map((p: any) => p.playerId)) as [string, string];
      const teamBIds = (m.teamBIds || m.teamB.map((p: any) => p.playerId)) as [string, string];
      return {
        matchId: m.id, status: "completed",
        roundNumber: m.roundNumber, courtId: m.courtId,
        teamA: teamAIds, teamB: teamBIds, teamAIds, teamBIds,
        scorePayload: m.scorePayload, winnerTeam: m.winnerTeam,
      };
    });
    const lockedMatches: LockedMatch[] = lockedFull.map((m) => ({
      roundNumber: m.roundNumber, courtId: m.courtId, teamA: m.teamA, teamB: m.teamB,
    }));

    const recomputedStats = recomputeStatsFromLocked(lockedFull, session.scoringMode);

    // Sit-outs only count for already-played (completed/in-progress) rounds.
    const sitOutCounts = new Map<string, number>();
    for (const sDoc of sitOutsSnap.docs) {
      const d = sDoc.data() as any;
      if (d.roundNumber <= elapsedRounds) {
        sitOutCounts.set(d.playerId, (sitOutCounts.get(d.playerId) ?? 0) + 1);
      }
    }

    // Engine input: reuse the shared mapping (schedulable filter + availableFromRound),
    // but feed it the precise completed-only locked set. elapsedRounds matches D4.
    const engineInput = mapSessionToEngineInput(session, players, rounds, [], "rebalance");
    engineInput.lockedMatches = lockedMatches;
    engineInput.elapsedRounds = elapsedRounds;

    const engineOutput = engineGenerateSchedule(engineInput);

    // Roster changes for the summary
    const removedPlayers = players.filter(
      (p) => p.status === "left" || p.status === "removed" || p.status === "no_show"
    );
    const lateJoiners = players.filter((p) => p.availableFromRound && p.availableFromRound > 1);

    // ─────────────────────────────── WRITES ───────────────────────────────
    // 1. Reconcile every player's stats from the locked snapshot (M4: applies to
    //    all players, not only those in a locked match, so drift is corrected).
    const zero = { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
    for (const p of players) {
      const base = recomputedStats.get(p.id) ?? { ...zero, sitOutCount: 0 };
      const sitOutCount = sitOutCounts.get(p.id) ?? 0;
      const playerStats = { ...base, sitOutCount };
      t.set(db.doc(`sessions/${sessionId}/players/${p.id}`), playerStats, { merge: true });
      t.set(db.doc(`sessions/${sessionId}/leaderboard/${p.id}`),
        { ...playerStats, displayName: p.displayName }, { merge: true });
    }

    // 2. Delete future (scheduled, > elapsed) rounds, their matches, and sit-outs.
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

    // 3. Write the regenerated future rounds/matches/sit-outs.
    const displayName = (pid: string) => players.find((p) => p.id === pid)?.displayName || "Unknown";
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

    // 4. Generation run + audit.
    t.set(db.collection(`sessions/${sessionId}/generationRuns`).doc(), {
      mode: "rebalance",
      trigger,
      metadata: engineOutput.metadata,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });
    writeAudit(t, sessionId, {
      actorUid: uid,
      action: "generation/rebalanced",
      details: { trigger, metadata: engineOutput.metadata },
    });

    const summary = buildRebalanceSummary({
      completedPreserved: completedMatches.length,
      inProgressPreserved: inProgressCount,
      removed: removedPlayers.map((p) => p.displayName),
      addedFromRound: lateJoiners.map((p) => ({ name: p.displayName, round: p.availableFromRound })),
      minGames: engineOutput.metadata.minGamesPerPlayer,
      maxGames: engineOutput.metadata.maxGamesPerPlayer,
    });

    return { summary, metadata: engineOutput.metadata };
  });

  return { success: true, ...result };
});
