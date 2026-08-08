import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { canEnterScore } from "@picklebaddies/domain";
import { deriveWinner, ScorePayload } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { assertString, assertInt, assertScorePayload } from "./lib/validation.js";

export const submitScore = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const matchId = assertString(request.data.matchId, "matchId");
  // payload validation deferred until scoringMode is known (below)
  const rawPayload = request.data.payload as ScorePayload;

  const db = getFirestore();

  return db.runTransaction(async (transaction) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canEnterScore, transaction);

    // F-H5: scores only belong to a live session and a match that is currently
    // playable. Scoring a future (scheduled) match would lock it and corrupt the
    // next rebalance, so reject anything outside the current round / not in play.
    if (session.status !== "active" && session.status !== "paused") {
      throw new HttpsError("failed-precondition", "Scores can only be entered while the session is active.");
    }
    if (roundNumber > (session.currentRoundNumber || 0)) {
      throw new HttpsError("failed-precondition", "Cannot score a future round.");
    }

    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await transaction.get(matchRef);
    if (!matchDoc.exists) throw new HttpsError("not-found", "Match not found.");
    const match = matchDoc.data()!;

    if (match.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Cannot submit score for a cancelled match.");
    }

    const payload = assertScorePayload(rawPayload, session.scoringMode);
    const winnerTeam = deriveWinner(payload, session.scoringMode);

    const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
    const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
    const allPlayerIds = [...teamAIds, ...teamBIds];

    const playerStatsRefs = allPlayerIds.map(id => db.doc(`sessions/${sessionId}/players/${id}`));
    const playerStatsDocs = await Promise.all(playerStatsRefs.map(ref => transaction.get(ref)));

    const leaderboardRefs = allPlayerIds.map(id => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
    const leaderboardDocs = await Promise.all(leaderboardRefs.map(ref => transaction.get(ref)));

    const isEdit = match.status === "completed";
    const priorWinnerTeam = match.winnerTeam;
    const priorPayload = match.scorePayload;

    // We need to reverse prior stats if it's an edit
    const updateStats = (docData: any, playerId: string, reverse: boolean = false) => {
      const stats = docData || { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
      const isTeamA = teamAIds.includes(playerId);
      const isWinner = reverse ? (priorWinnerTeam === (isTeamA ? "A" : "B")) : (winnerTeam === (isTeamA ? "A" : "B"));
      const src = reverse ? priorPayload : payload;
      // F-C2: use typeof checks, never truthiness — a legitimate score of 0 must
      // not be silently dropped from points stats.
      const rawFor = isTeamA ? src?.teamAScore : src?.teamBScore;
      const rawAgainst = isTeamA ? src?.teamBScore : src?.teamAScore;
      const pFor = typeof rawFor === "number" ? rawFor : undefined;
      const pAgainst = typeof rawAgainst === "number" ? rawAgainst : undefined;

      const sign = reverse ? -1 : 1;
      const hasPoints = pFor !== undefined && pAgainst !== undefined;

      return {
        ...stats,
        gamesPlayed: (stats.gamesPlayed || 0) + sign * 1,
        wins: (stats.wins || 0) + (isWinner ? sign * 1 : 0),
        losses: (stats.losses || 0) + (!isWinner ? sign * 1 : 0),
        pointsFor: (stats.pointsFor || 0) + (pFor !== undefined ? sign * pFor : 0),
        pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== undefined ? sign * pAgainst : 0),
        pointDifference: (stats.pointDifference || 0) + (hasPoints ? sign * (pFor! - pAgainst!) : 0),
      };
    };

    const newStatsMap = new Map<string, any>();
    const newLbMap = new Map<string, any>();

    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i]!;
      let pStats = playerStatsDocs[i]?.data() || {};
      let lbStats = leaderboardDocs[i]?.data() || {};

      if (isEdit) {
        pStats = updateStats(pStats, pid, true);
        lbStats = updateStats(lbStats, pid, true);
      }

      pStats = updateStats(pStats, pid, false);
      lbStats = updateStats(lbStats, pid, false);

      newStatsMap.set(pid, pStats);
      newLbMap.set(pid, lbStats);
    }

    // Apply updates
    transaction.update(matchRef, {
      scorePayload: payload,
      winnerTeam,
      status: "completed",
      isLocked: true,
      completedAt: FieldValue.serverTimestamp(),
    });

    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i]!;
      transaction.set(playerStatsRefs[i]!, newStatsMap.get(pid)!, { merge: true });
      transaction.set(leaderboardRefs[i]!, newLbMap.get(pid)!, { merge: true });
    }

    writeAudit(transaction, sessionId, {
      actorUid: request.auth!.uid,
      action: isEdit ? "score_changed" : "score",
      details: { matchId, roundNumber, payload, winnerTeam }
    });

    return { success: true };
  });
});
