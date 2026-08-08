"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canEnterScore, deriveWinner, type ScorePayload, type ScoringMode } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";
import { validatePayload, readAutoFillInputs, writeAutoFill } from "./scheduling";

export interface SubmitScoreInput {
  sessionId: string;
  matchId: string;
  payload: ScorePayload;
}

export async function submitScore(input: SubmitScoreInput): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const { sessionId, matchId, payload } = input;
  if (!sessionId || !matchId) return err("INVALID_ARGUMENT", "sessionId and matchId are required");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const matchRef = db.doc(`sessions/${sessionId}/matches/${matchId}`);

      // ── ALL READS FIRST ──
      const [sessionSnap, matchSnap] = await Promise.all([t.get(sessionRef), t.get(matchRef)]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      if (!matchSnap.exists) throw Object.assign(new Error("Match not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;
      const match = matchSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canEnterScore(role)) throw Object.assign(new Error("Must be a squad member to submit scores"), { code: "FORBIDDEN" });

      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(new Error("Scores can only be entered while the session is active"), { code: "FAILED_PRECONDITION" });
      }
      if (match.status === "cancelled") {
        throw Object.assign(new Error("Cannot submit score for a cancelled match"), { code: "FAILED_PRECONDITION" });
      }

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

      const isEdit = match.status === "completed";
      const auto = isEdit ? null : await readAutoFillInputs(t, db, sessionId, matchId);

      const [playerDocs, lbDocs, globalDocs] = await Promise.all([
        Promise.all(playerRefs.map((r) => t.get(r))),
        Promise.all(lbRefs.map((r) => t.get(r))),
        Promise.all(globalRefs.map((r) => t.get(r))),
      ]);

      // ── THEN ALL WRITES ──
      const priorWinner: "A" | "B" | undefined = match.winnerTeam;
      const priorPayload: ScorePayload | undefined = match.scorePayload;

      for (let i = 0; i < allPlayerIds.length; i++) {
        const pid = allPlayerIds[i]!;
        const isTeamA = teamAIds.includes(pid);

        let pStats = playerDocs[i]?.data() ?? {};
        let lbStats = lbDocs[i]?.data() ?? {};
        let gStats = globalDocs[i]?.data() ?? {};

        if (isEdit && priorPayload && priorWinner) {
          pStats = applyDelta(pStats, { isTeamA, winner: priorWinner, payload: priorPayload, sign: -1 });
          lbStats = applyDelta(lbStats, { isTeamA, winner: priorWinner, payload: priorPayload, sign: -1 });
          gStats = applyGlobalDelta(gStats, { isTeamA, winner: priorWinner, payload: priorPayload, sign: -1 });
        }

        pStats = applyDelta(pStats, { isTeamA, winner: winnerTeam, payload, sign: 1 });
        lbStats = applyDelta(lbStats, { isTeamA, winner: winnerTeam, payload, sign: 1 });
        gStats = applyGlobalDelta(gStats, { isTeamA, winner: winnerTeam, payload, sign: 1 });

        t.set(playerRefs[i]!, pStats, { merge: true });
        t.set(lbRefs[i]!, lbStats, { merge: true });
        const isGuestGlobal = (globalDocs[i]?.data() as any)?.isGuest === true;
        if (globalDocs[i]?.exists && !isGuestGlobal) {
          t.update(globalRefs[i]!, { ...buildGlobalUpdate(gStats), lastPlayedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        }
      }

      t.update(matchRef, {
        scorePayload: payload,
        winnerTeam,
        status: "completed",
        isLocked: true,
        completedAt: FieldValue.serverTimestamp(),
      });

      if (auto) writeAutoFill(t, db, sessionId, sessionRef, auto);

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: isEdit ? "score/changed" : "score/submitted",
        details: { matchId, winnerTeam },
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

interface DeltaArgs {
  isTeamA: boolean;
  winner: "A" | "B";
  payload: ScorePayload;
  sign: 1 | -1;
}

function applyDelta(stats: Record<string, any>, { isTeamA, winner, payload, sign }: DeltaArgs): Record<string, any> {
  const isWinner = winner === (isTeamA ? "A" : "B");
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

function applyGlobalDelta(stats: Record<string, any>, { isTeamA, winner, payload, sign }: DeltaArgs): Record<string, any> {
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

// ── Optional Score Entry: One-tap "Finish Game" ───────────────────────────────

export interface CompleteMatchInput {
  sessionId: string;
  matchId: string;
}

/**
 * Completes a match without requiring any score input. Marks it completed and
 * locked, increments each player's gamesPlayed, and — like submitScore — auto-
 * fills the freed court(s) for whoever's now idle.
 */
export async function completeMatchWithoutScore(
  input: CompleteMatchInput,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const { sessionId, matchId } = input;
  if (!sessionId || !matchId) return err("INVALID_ARGUMENT", "sessionId and matchId are required");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const matchRef = db.doc(`sessions/${sessionId}/matches/${matchId}`);

      // ── ALL READS FIRST ──
      const [sessionSnap, matchSnap] = await Promise.all([t.get(sessionRef), t.get(matchRef)]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      if (!matchSnap.exists) throw Object.assign(new Error("Match not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;
      const match = matchSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canEnterScore(role)) {
        throw Object.assign(new Error("Must be a squad member to complete matches"), { code: "FORBIDDEN" });
      }
      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(new Error("Scores can only be entered while the session is active"), { code: "FAILED_PRECONDITION" });
      }
      if (match.status === "cancelled" || match.status === "completed") {
        throw Object.assign(new Error("Match is already completed or cancelled"), { code: "FAILED_PRECONDITION" });
      }

      const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
      const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
      const allPlayerIds = [...teamAIds, ...teamBIds];
      const playerRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/players/${id}`));
      const lbRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`));

      const auto = await readAutoFillInputs(t, db, sessionId, matchId);

      const [playerDocs, lbDocs] = await Promise.all([
        Promise.all(playerRefs.map((r) => t.get(r))),
        Promise.all(lbRefs.map((r) => t.get(r))),
      ]);

      // ── THEN ALL WRITES ──
      for (let i = 0; i < allPlayerIds.length; i++) {
        const pData = playerDocs[i]?.data() ?? {};
        const lbData = lbDocs[i]?.data() ?? {};
        t.set(playerRefs[i]!, { ...pData, gamesPlayed: (pData.gamesPlayed || 0) + 1 }, { merge: true });
        t.set(lbRefs[i]!, { ...lbData, gamesPlayed: (lbData.gamesPlayed || 0) + 1 }, { merge: true });
      }

      t.update(matchRef, {
        status: "completed",
        isLocked: true,
        completedAt: FieldValue.serverTimestamp(),
        scorePayload: null,
        winnerTeam: null,
      });

      if (auto) writeAutoFill(t, db, sessionId, sessionRef, auto);

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "score/completed_without_score",
        details: { matchId },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }

  return ok(undefined);
}
