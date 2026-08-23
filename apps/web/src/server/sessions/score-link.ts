"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeJoinCode, deriveWinner, type ScorePayload, type ScoringMode } from "@picklebaddies/domain";
import { headers } from "next/headers";
import { getAdminDb } from "@/server/firebase/admin";
import { ok, err, type ActionResult } from "@/server/result";
import { requireActiveSessionSquad } from "./actions";
import { validatePayload, readAutoFillInputs, writeAutoFill } from "./scheduling";
import { applySquadRatingForMatch } from "./squad-rating";

// Public, unauthenticated: courtside scoring via a shareable link. Ported from
// the (undeployed) functions/src/scoreLink.ts Cloud Function — same rate-limit
// and lookup approach, adapted to the flat matches collection.

export interface ScoreLinkCourtMatch {
  matchId: string;
  teamA: Array<{ playerId: string; displayName: string }>;
  teamB: Array<{ playerId: string; displayName: string }>;
  status: string;
}

export interface ScoreLinkCourt {
  courtId: string;
  courtName: string;
  match: ScoreLinkCourtMatch | null;
}

export interface ScoreLinkData {
  sessionId: string;
  sessionName: string;
  sport: string;
  scoringMode: ScoringMode;
  sessionStatus: string;
  courts: ScoreLinkCourt[];
}

export async function getScoreLinkData(scoreCode: string): Promise<ActionResult<ScoreLinkData>> {
  const db = getAdminDb();
  const code = normalizeJoinCode(scoreCode);

  const q = await db.collection("sessions")
    .where("scoreCode", "==", code)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();
  if (q.empty) return err("NOT_FOUND", "Invalid or disabled score link.");

  const sessionDoc = q.docs[0]!;
  const sessionId = sessionDoc.id;
  const session = sessionDoc.data();

  if (session.status !== "active") {
    return ok({
      sessionId,
      sessionName: session.name,
      sport: session.sport,
      scoringMode: session.scoringMode,
      sessionStatus: session.status,
      courts: [],
    });
  }

  const activeCourts: Array<{ courtId: string; name: string }> =
    (session.courts as Array<{ courtId: string; name: string; isActive?: boolean }>).filter((c) => c.isActive !== false);

  const scheduledMatchesSnap = await db.collection(`sessions/${sessionId}/matches`)
    .where("status", "==", "scheduled")
    .get();
  const scheduledMatches = scheduledMatchesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const isRoundRobin = session.sessionFormat === "fixed_pair_round_robin";
  const roundRobinRounds = scheduledMatches
    .map((match: any) => Number(match.roundNumber ?? 0))
    .filter((round) => round > 0);
  const currentRound = isRoundRobin && roundRobinRounds.length > 0 ? Math.min(...roundRobinRounds) : null;

  const courts: ScoreLinkCourt[] = activeCourts.map((court) => {
    const match = scheduledMatches.find((candidate: any) =>
      candidate.courtId === court.courtId
      && (!currentRound || Number(candidate.roundNumber ?? 0) === currentRound),
    ) as any;
    if (!match) return { courtId: court.courtId, courtName: court.name, match: null };
    return {
      courtId: court.courtId,
      courtName: court.name,
      match: {
        matchId: match.id,
        teamA: (match.teamA as Array<{ playerId: string; displayName: string }>).map((p) => ({ playerId: p.playerId, displayName: p.displayName })),
        teamB: (match.teamB as Array<{ playerId: string; displayName: string }>).map((p) => ({ playerId: p.playerId, displayName: p.displayName })),
        status: match.status as string,
      },
    };
  });

  return ok({
    sessionId,
    sessionName: session.name,
    sport: session.sport,
    scoringMode: session.scoringMode,
    sessionStatus: session.status,
    courts,
  });
}

async function checkRateLimit(db: FirebaseFirestore.Firestore, scoreCode: string, ip: string): Promise<ActionResult<void> | null> {
  const limitRef = db.collection("_rateLimits").doc(`${scoreCode}_${ip}`);
  const blocked = await db.runTransaction(async (t) => {
    const doc = await t.get(limitRef);
    const now = Date.now();
    const windowMs = 60_000;

    if (!doc.exists || now > doc.data()!.resetAt) {
      t.set(limitRef, { count: 1, resetAt: now + windowMs });
      return false;
    }
    if (doc.data()!.count >= 10) return true;
    t.update(limitRef, { count: doc.data()!.count + 1 });
    return false;
  });
  return blocked ? err("FAILED_PRECONDITION", "Too many requests. Please try again later.") : null;
}

export async function submitScoreByLink(
  scoreCode: string,
  courtId: string,
  payload: ScorePayload,
): Promise<ActionResult<{ courtName: string; winnerTeam: "A" | "B" }>> {
  const db = getAdminDb();
  const code = normalizeJoinCode(scoreCode);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const limited = await checkRateLimit(db, code, ip);
  if (limited) return limited as ActionResult<{ courtName: string; winnerTeam: "A" | "B" }>;

  const sessionQuery = await db.collection("sessions")
    .where("scoreCode", "==", code)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();
  if (sessionQuery.empty) return err("NOT_FOUND", "Invalid or disabled score link.");
  const sessionId = sessionQuery.docs[0]!.id;
  const activeSquad = await requireActiveSessionSquad(db, sessionId, "");
  if (!activeSquad.ok) return activeSquad;

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);

      // ── ALL READS FIRST ──
      const [sessionSnap, scheduledMatchesSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(db.collection(`sessions/${sessionId}/matches`).where("status", "==", "scheduled")),
      ]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;
      if (session.status !== "active") throw Object.assign(new Error("Session is not active"), { code: "FAILED_PRECONDITION" });
      if (scheduledMatchesSnap.empty) throw Object.assign(new Error("No match found on that court"), { code: "NOT_FOUND" });

      const scheduledMatches = scheduledMatchesSnap.docs.map((doc) => ({ doc, data: doc.data() }));
      const isRoundRobinSession = session.sessionFormat === "fixed_pair_round_robin";
      const roundRobinRounds = scheduledMatches
        .map((candidate) => Number((candidate.data as any).roundNumber ?? 0))
        .filter((round) => round > 0);
      const currentRound = isRoundRobinSession && roundRobinRounds.length > 0 ? Math.min(...roundRobinRounds) : null;
      const currentMatch = scheduledMatches.find((candidate) =>
        (candidate.data as any).courtId === courtId
        && (!currentRound || Number((candidate.data as any).roundNumber ?? 0) === currentRound),
      );
      if (!currentMatch) throw Object.assign(new Error("No match found on that court"), { code: "NOT_FOUND" });

      const matchDoc = currentMatch.doc;
      const match = matchDoc.data();
      const matchRef = matchDoc.ref;

      const validated = validatePayload(payload, session.scoringMode);
      if (!validated.ok) throw Object.assign(new Error(validated.message), { code: "INVALID_ARGUMENT" });
      const winnerTeam = deriveWinner(payload, session.scoringMode);

      const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
      const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
      const allPlayerIds = [...teamAIds, ...teamBIds];
      const isRoundRobin = (session.sessionFormat ?? match.sessionFormat) === "fixed_pair_round_robin";
      const roundRobinTeamAId = typeof match.roundRobinTeamAId === "string" ? match.roundRobinTeamAId : null;
      const roundRobinTeamBId = typeof match.roundRobinTeamBId === "string" ? match.roundRobinTeamBId : null;
      const playerRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/players/${id}`));
      const lbRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
      const teamLeaderboardRefs = roundRobinTeamAId && roundRobinTeamBId
        ? [
          db.doc(`sessions/${sessionId}/teamLeaderboard/${roundRobinTeamAId}`),
          db.doc(`sessions/${sessionId}/teamLeaderboard/${roundRobinTeamBId}`),
        ]
        : [];

      const auto = isRoundRobin ? null : await readAutoFillInputs(t, db, sessionId, matchDoc.id);

      const [playerDocs, lbDocs, teamLeaderboardDocs] = await Promise.all([
        Promise.all(playerRefs.map((r) => t.get(r))),
        Promise.all(lbRefs.map((r) => t.get(r))),
        Promise.all(teamLeaderboardRefs.map((r) => t.get(r))),
      ]);

      if (teamAIds.length === 2 && teamBIds.length === 2) {
        await applySquadRatingForMatch(t, db, {
          groupId: String(session.groupId),
          teamAIds: [teamAIds[0]!, teamAIds[1]!],
          teamBIds: [teamBIds[0]!, teamBIds[1]!],
          winnerTeam,
          payload,
        });
      }

      // ── THEN ALL WRITES ──
      const updateStats = (data: any, playerId: string) => {
        const stats = data || { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
        const isTeamA = teamAIds.includes(playerId);
        const isWinner = winnerTeam === (isTeamA ? "A" : "B");
        const rawFor = isTeamA ? (payload as any).teamAScore : (payload as any).teamBScore;
        const rawAgainst = isTeamA ? (payload as any).teamBScore : (payload as any).teamAScore;
        const hasPoints = typeof rawFor === "number" && typeof rawAgainst === "number";
        return {
          ...stats,
          gamesPlayed: (stats.gamesPlayed || 0) + 1,
          wins: (stats.wins || 0) + (isWinner ? 1 : 0),
          losses: (stats.losses || 0) + (isWinner ? 0 : 1),
          pointsFor: (stats.pointsFor || 0) + (hasPoints ? rawFor : 0),
          pointsAgainst: (stats.pointsAgainst || 0) + (hasPoints ? rawAgainst : 0),
          pointDifference: (stats.pointDifference || 0) + (hasPoints ? rawFor - rawAgainst : 0),
        };
      };

      t.update(matchRef, {
        scorePayload: payload,
        winnerTeam,
        status: "completed",
        isLocked: true,
        completedAt: FieldValue.serverTimestamp(),
        squadRatingAppliedAt: FieldValue.serverTimestamp(),
      });
      for (let i = 0; i < allPlayerIds.length; i++) {
        t.set(playerRefs[i]!, updateStats(playerDocs[i]?.data(), allPlayerIds[i]!), { merge: true });
        t.set(lbRefs[i]!, updateStats(lbDocs[i]?.data(), allPlayerIds[i]!), { merge: true });
      }
      if (roundRobinTeamAId && roundRobinTeamBId && teamLeaderboardRefs.length === 2) {
        t.set(teamLeaderboardRefs[0]!, updateTeamStats(teamLeaderboardDocs[0]?.data(), true, payload, winnerTeam), { merge: true });
        t.set(teamLeaderboardRefs[1]!, updateTeamStats(teamLeaderboardDocs[1]?.data(), false, payload, winnerTeam), { merge: true });
      }
      if (auto) writeAutoFill(t, db, sessionId, sessionRef, auto);

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: "court_link",
        action: "score/submitted",
        details: { matchId: matchDoc.id, courtId, winnerTeam, source: "court_link", ip },
        createdAt: FieldValue.serverTimestamp(),
      });

      const courtName = (session.courts as Array<{ courtId: string; name: string }>).find((c) => c.courtId === courtId)?.name ?? courtId;
      return { courtName, winnerTeam };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", e.message);
    throw e;
  }
}

function updateTeamStats(data: any, isTeamA: boolean, payload: ScorePayload, winnerTeam: "A" | "B") {
  const stats = data || { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
  const isWinner = winnerTeam === (isTeamA ? "A" : "B");
  const rawFor = "teamAScore" in payload ? (isTeamA ? payload.teamAScore : payload.teamBScore) : undefined;
  const rawAgainst = "teamAScore" in payload ? (isTeamA ? payload.teamBScore : payload.teamAScore) : undefined;
  const hasPoints = typeof rawFor === "number" && typeof rawAgainst === "number";
  return {
    ...stats,
    gamesPlayed: (stats.gamesPlayed || 0) + 1,
    wins: (stats.wins || 0) + (isWinner ? 1 : 0),
    losses: (stats.losses || 0) + (isWinner ? 0 : 1),
    pointsFor: (stats.pointsFor || 0) + (hasPoints ? rawFor : 0),
    pointsAgainst: (stats.pointsAgainst || 0) + (hasPoints ? rawAgainst : 0),
    pointDifference: (stats.pointDifference || 0) + (hasPoints ? rawFor - rawAgainst : 0),
  };
}
