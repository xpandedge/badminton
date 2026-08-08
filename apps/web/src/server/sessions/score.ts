"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canEnterScore, deriveWinner, type ScorePayload, type ScoringMode } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

export interface SubmitScoreInput {
  sessionId: string;
  roundNumber: number;
  matchId: string;
  payload: ScorePayload;
}

export async function submitScore(input: SubmitScoreInput): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const { sessionId, roundNumber, matchId, payload } = input;

  if (!sessionId || !matchId) return err("INVALID_ARGUMENT", "sessionId and matchId are required");
  if (typeof roundNumber !== "number" || roundNumber < 1) {
    return err("INVALID_ARGUMENT", "roundNumber must be a positive integer");
  }

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      // Membership check: any squad member can score (D8)
      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canEnterScore(role)) throw Object.assign(new Error("Must be a squad member to submit scores"), { code: "FORBIDDEN" });

      // F-H5: only score active/paused sessions and non-future rounds
      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(new Error("Scores can only be entered while the session is active"), { code: "FAILED_PRECONDITION" });
      }
      if (roundNumber > (session.currentRoundNumber || 0)) {
        throw Object.assign(new Error("Cannot score a future round"), { code: "FAILED_PRECONDITION" });
      }

      const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
      const matchSnap = await t.get(matchRef);
      if (!matchSnap.exists) throw Object.assign(new Error("Match not found"), { code: "NOT_FOUND" });
      const match = matchSnap.data()!;

      if (match.status === "cancelled") {
        throw Object.assign(new Error("Cannot submit score for a cancelled match"), { code: "FAILED_PRECONDITION" });
      }

      // Validate payload against the session's scoring mode
      const mode = session.scoringMode as ScoringMode;
      const validPayload = validatePayload(payload, mode);
      if (!validPayload.ok) throw Object.assign(new Error(validPayload.message), { code: "INVALID_ARGUMENT" });

      const winnerTeam = deriveWinner(payload, mode);

      const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
      const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
      const allPlayerIds = [...teamAIds, ...teamBIds];

      const playerRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/players/${id}`));
      const lbRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
      const globalRefs = allPlayerIds.map((id) => db.doc(`players/${id}`));

      const [playerDocs, lbDocs, globalDocs] = await Promise.all([
        Promise.all(playerRefs.map((r) => t.get(r))),
        Promise.all(lbRefs.map((r) => t.get(r))),
        Promise.all(globalRefs.map((r) => t.get(r))),
      ]);

      const isEdit = match.status === "completed";
      const priorWinner: "A" | "B" | undefined = match.winnerTeam;
      const priorPayload: ScorePayload | undefined = match.scorePayload;

      for (let i = 0; i < allPlayerIds.length; i++) {
        const pid = allPlayerIds[i]!;
        const isTeamA = teamAIds.includes(pid);

        let pStats = playerDocs[i]?.data() ?? {};
        let lbStats = lbDocs[i]?.data() ?? {};
        let gStats = globalDocs[i]?.data() ?? {};

        if (isEdit && priorPayload && priorWinner) {
          pStats = applyDelta(pStats, { playerId: pid, isTeamA, winner: priorWinner, payload: priorPayload, mode, sign: -1 });
          lbStats = applyDelta(lbStats, { playerId: pid, isTeamA, winner: priorWinner, payload: priorPayload, mode, sign: -1 });
          gStats = applyGlobalDelta(gStats, { isTeamA, winner: priorWinner, payload: priorPayload, mode, sign: -1 });
        }

        pStats = applyDelta(pStats, { playerId: pid, isTeamA, winner: winnerTeam, payload, mode, sign: 1 });
        lbStats = applyDelta(lbStats, { playerId: pid, isTeamA, winner: winnerTeam, payload, mode, sign: 1 });
        gStats = applyGlobalDelta(gStats, { isTeamA, winner: winnerTeam, payload, mode, sign: 1 });

        t.set(playerRefs[i]!, pStats, { merge: true });
        t.set(lbRefs[i]!, lbStats, { merge: true });
        if (globalDocs[i]?.exists) {
          t.update(globalRefs[i]!, { ...buildGlobalUpdate(gStats), lastPlayedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        }
        // If global doc doesn't exist yet (sign-in race), skip — ensureGlobalPlayer handles it
      }

      t.update(matchRef, {
        scorePayload: payload,
        winnerTeam,
        status: "completed",
        isLocked: true,
        completedAt: FieldValue.serverTimestamp(),
      });

      const auditRef = db.collection(`sessions/${sessionId}/auditLogs`).doc();
      t.set(auditRef, {
        actorUid: user.uid,
        action: isEdit ? "score/changed" : "score/submitted",
        details: { matchId, roundNumber, winnerTeam },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", e.message);
    throw e;
  }

  return ok(undefined);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validatePayload(
  payload: unknown,
  mode: ScoringMode,
): { ok: true } | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") return { ok: false, message: "payload must be an object" };
  const p = payload as Record<string, unknown>;
  if (mode === "points") {
    if (typeof p.teamAScore !== "number" || typeof p.teamBScore !== "number") {
      return { ok: false, message: "points mode requires numeric teamAScore and teamBScore" };
    }
    if (p.teamAScore === p.teamBScore) return { ok: false, message: "Tied scores are not allowed" };
    return { ok: true };
  }
  if (p.winnerTeam !== "A" && p.winnerTeam !== "B") {
    return { ok: false, message: "winner_only mode requires winnerTeam of 'A' or 'B'" };
  }
  return { ok: true };
}

interface DeltaArgs {
  playerId?: string;
  isTeamA: boolean;
  winner: "A" | "B";
  payload: ScorePayload;
  mode: ScoringMode;
  sign: 1 | -1;
}

function applyDelta(stats: Record<string, any>, { isTeamA, winner, payload, sign }: DeltaArgs): Record<string, any> {
  const isWinner = winner === (isTeamA ? "A" : "B");
  // F-C2: typeof check — a legitimate score of 0 must not be dropped
  const rawFor = "teamAScore" in payload ? (isTeamA ? payload.teamAScore : payload.teamBScore) : undefined;
  const rawAgainst = "teamAScore" in payload ? (isTeamA ? payload.teamBScore : payload.teamAScore) : undefined;
  const hasPoints = typeof rawFor === "number" && typeof rawAgainst === "number";

  return {
    ...stats,
    gamesPlayed: (stats.gamesPlayed || 0) + sign,
    wins: (stats.wins || 0) + (isWinner ? sign : 0),
    losses: (stats.losses || 0) + (!isWinner ? sign : 0),
    pointsFor: (stats.pointsFor || 0) + (hasPoints ? sign * rawFor! : 0),
    pointsAgainst: (stats.pointsAgainst || 0) + (hasPoints ? sign * rawAgainst! : 0),
    pointDifference: (stats.pointDifference || 0) + (hasPoints ? sign * (rawFor! - rawAgainst!) : 0),
  };
}

interface GlobalDeltaArgs {
  isTeamA: boolean;
  winner: "A" | "B";
  payload: ScorePayload;
  mode: ScoringMode;
  sign: 1 | -1;
}

function applyGlobalDelta(stats: Record<string, any>, { isTeamA, winner, payload, sign }: GlobalDeltaArgs): Record<string, any> {
  const isWinner = winner === (isTeamA ? "A" : "B");
  const rawFor = "teamAScore" in payload ? (isTeamA ? payload.teamAScore : payload.teamBScore) : undefined;
  const rawAgainst = "teamAScore" in payload ? (isTeamA ? payload.teamBScore : payload.teamAScore) : undefined;
  const hasPoints = typeof rawFor === "number" && typeof rawAgainst === "number";

  return {
    ...stats,
    totalGames: (stats.totalGames || 0) + sign,
    totalWins: (stats.totalWins || 0) + (isWinner ? sign : 0),
    totalLosses: (stats.totalLosses || 0) + (!isWinner ? sign : 0),
    totalPointsFor: (stats.totalPointsFor || 0) + (hasPoints ? sign * rawFor! : 0),
    totalPointsAgainst: (stats.totalPointsAgainst || 0) + (hasPoints ? sign * rawAgainst! : 0),
    totalPointDiff: (stats.totalPointDiff || 0) + (hasPoints ? sign * (rawFor! - rawAgainst!) : 0),
  };
}

function buildGlobalUpdate(stats: Record<string, any>): Record<string, any> {
  return {
    totalGames: stats.totalGames ?? 0,
    totalWins: stats.totalWins ?? 0,
    totalLosses: stats.totalLosses ?? 0,
    totalPointsFor: stats.totalPointsFor ?? 0,
    totalPointsAgainst: stats.totalPointsAgainst ?? 0,
    totalPointDiff: stats.totalPointDiff ?? 0,
  };
}
