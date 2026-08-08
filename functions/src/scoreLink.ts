import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeJoinCode, deriveWinner, type ScorePayload } from "@picklebaddies/domain";
import { assertString, assertScorePayload } from "./lib/validation.js";
import { checkRateLimit } from "./lib/rateLimit.js";
import { writeAudit } from "./lib/audit.js";

export const getScoreLinkData = onCall({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const scoreCode = normalizeJoinCode(rawCode);

  const db = getFirestore();
  const q = await db.collection("sessions")
    .where("scoreCode", "==", scoreCode)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invalid or disabled score link.");

  const sessionDoc = q.docs[0]!;
  const session = sessionDoc.data();
  const sessionId = sessionDoc.id;

  if (session.status !== "active") {
    return {
      sessionId,
      sessionName: session.name,
      sport: session.sport,
      scoringMode: session.scoringMode,
      currentRoundNumber: session.currentRoundNumber || 0,
      sessionStatus: session.status,
      courts: [],
    };
  }

  const activeCourts: Array<{ courtId: string; name: string }> =
    (session.courts as Array<{ courtId: string; name: string; isActive: boolean }>)
      .filter((c) => c.isActive !== false);

  const matchSnaps = await Promise.all(
    activeCourts.map((court) =>
      db.collection(`sessions/${sessionId}/rounds/round_${session.currentRoundNumber}/matches`)
        .where("courtId", "==", court.courtId)
        .limit(1)
        .get()
    )
  );

  const courts = activeCourts.map((court, i) => {
    const matchDoc = matchSnaps[i]!.docs[0];
    if (!matchDoc || matchDoc.data().status === "cancelled") {
      return { courtId: court.courtId, courtName: court.name, match: null };
    }
    const m = matchDoc.data();
    return {
      courtId: court.courtId,
      courtName: court.name,
      match: {
        matchId: matchDoc.id,
        teamA: (m.teamA as Array<{ playerId: string; displayName: string }>).map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
        teamB: (m.teamB as Array<{ playerId: string; displayName: string }>).map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
        status: m.status as string,
      },
    };
  });

  return {
    sessionId,
    sessionName: session.name,
    sport: session.sport,
    scoringMode: session.scoringMode,
    currentRoundNumber: session.currentRoundNumber,
    sessionStatus: session.status,
    courts,
  };
});

export const submitScoreByLink = onCall({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const courtId = assertString(request.data?.courtId, "courtId");
  const rawPayload = request.data?.payload as ScorePayload;

  const ip: string = (request.rawRequest as any)?.ip || "unknown";
  const scoreCode = normalizeJoinCode(rawCode);

  await checkRateLimit(scoreCode, ip);

  const db = getFirestore();
  const q = await db.collection("sessions")
    .where("scoreCode", "==", scoreCode)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invalid or disabled score link.");

  const sessionDoc = q.docs[0]!;
  const sessionId = sessionDoc.id;
  const session = sessionDoc.data();

  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "Session is not active.");
  }

  const roundNumber: number = session.currentRoundNumber || 0;
  if (roundNumber === 0) throw new HttpsError("failed-precondition", "No active round.");

  return db.runTransaction(async (transaction) => {
    const matchQuery = await transaction.get(db
      .collection(`sessions/${sessionId}/rounds/round_${roundNumber}/matches`)
      .where("courtId", "==", courtId)
      .limit(1));

    if (matchQuery.empty) {
      throw new HttpsError("not-found", "No match found on that court.");
    }

    const matchDoc = matchQuery.docs[0]!;
    const match = matchDoc.data();
    const matchRef = matchDoc.ref;

    if (match.status === "completed") {
      throw new HttpsError("failed-precondition", "Match already scored.");
    }
    if (match.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Match is cancelled.");
    }

    const payload = assertScorePayload(rawPayload, session.scoringMode);
    const winnerTeam = deriveWinner(payload, session.scoringMode);

    const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
    const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
    const allPlayerIds = [...teamAIds, ...teamBIds];

    const playerStatsRefs = allPlayerIds.map((id) =>
      db.doc(`sessions/${sessionId}/players/${id}`)
    );
    const leaderboardRefs = allPlayerIds.map((id) =>
      db.doc(`sessions/${sessionId}/leaderboard/${id}`)
    );

    const [playerStatsDocs, leaderboardDocs] = await Promise.all([
      Promise.all(playerStatsRefs.map((ref) => transaction.get(ref))),
      Promise.all(leaderboardRefs.map((ref) => transaction.get(ref))),
    ]);

    const updateStats = (docData: any, playerId: string) => {
      const stats = docData || {
        gamesPlayed: 0, wins: 0, losses: 0,
        pointsFor: 0, pointsAgainst: 0, pointDifference: 0,
      };
      const isTeamA = teamAIds.includes(playerId);
      const isWinner = winnerTeam === (isTeamA ? "A" : "B");
      const rawFor = isTeamA ? (payload as any).teamAScore : (payload as any).teamBScore;
      const rawAgainst = isTeamA ? (payload as any).teamBScore : (payload as any).teamAScore;
      const pFor = typeof rawFor === "number" ? rawFor : undefined;
      const pAgainst = typeof rawAgainst === "number" ? rawAgainst : undefined;
      const hasPoints = pFor !== undefined && pAgainst !== undefined;
      return {
        ...stats,
        gamesPlayed: (stats.gamesPlayed || 0) + 1,
        wins: (stats.wins || 0) + (isWinner ? 1 : 0),
        losses: (stats.losses || 0) + (!isWinner ? 1 : 0),
        pointsFor: (stats.pointsFor || 0) + (pFor !== undefined ? pFor : 0),
        pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== undefined ? pAgainst : 0),
        pointDifference: (stats.pointDifference || 0) + (hasPoints ? pFor! - pAgainst! : 0),
      };
    };

    transaction.update(matchRef, {
      scorePayload: payload,
      winnerTeam,
      status: "completed",
      isLocked: true,
      completedAt: FieldValue.serverTimestamp(),
    });

    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i]!;
      transaction.set(playerStatsRefs[i]!, updateStats(playerStatsDocs[i]?.data(), pid), { merge: true });
      transaction.set(leaderboardRefs[i]!, updateStats(leaderboardDocs[i]?.data(), pid), { merge: true });
    }

    writeAudit(transaction, sessionId, {
      actorUid: "court_link",
      action: "score",
      details: { matchId: matchDoc.id, roundNumber, courtId, payload, winnerTeam, source: "court_link", ip },
    });

    const courtName: string =
      (session.courts as Array<{ courtId: string; name: string }>)
        .find((c) => c.courtId === courtId)?.name ?? courtId;

    return { success: true, courtName, winnerTeam };
  });
});