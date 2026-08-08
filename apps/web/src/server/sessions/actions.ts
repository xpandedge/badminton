"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import {
  generateJoinCode,
  canCreateSession,
  canAdvanceRound,
  getSportConfig,
  type Sport,
  type ScoringMode,
} from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

export interface CourtInput {
  name: string;
  courtNumber: number;
}

export interface PlayerInput {
  playerId: string;
  displayName: string;
  skillLevel: string;
}

export interface CreateSessionInput {
  squadId: string;
  name: string;
  sport: Sport;
  courts: CourtInput[];
  players: PlayerInput[];
  durationMinutes: number;
  estimatedGameMinutes?: number;
  /** Override scoring mode; defaults to sport's defaultScoringMode. */
  scoringMode?: ScoringMode;
  venueName?: string;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<ActionResult<{ sessionId: string; joinCode: string; scoreCode: string }>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const { squadId, name, sport, courts, players, durationMinutes } = input;

  if (!name || name.trim().length < 2) {
    return err("INVALID_ARGUMENT", "Session name must be at least 2 characters");
  }
  if (courts.length === 0) {
    return err("INVALID_ARGUMENT", "At least one court is required");
  }
  // Players can be added after creation; just validate format if provided
  if (players.length > 0 && players.some((p) => !p.playerId || !p.displayName)) {
    return err("INVALID_ARGUMENT", "Each player must have a playerId and displayName");
  }

  const db = getAdminDb();

  // Verify membership — any member can create (D8)
  const memberSnap = await db.doc(`groups/${squadId}/members/${session.uid}`).get();
  const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
  if (!canCreateSession(role)) {
    return err("FORBIDDEN", "You must be a squad member to create a session");
  }

  const sportConfig = getSportConfig(sport);
  const scoringMode = input.scoringMode ?? sportConfig.defaultScoringMode;
  const estimatedGameMinutes = input.estimatedGameMinutes ?? 15;

  // Build DELTA_SPEC D2 court array
  const sessionCourts = courts.map((c, i) => ({
    courtId: `court_${i + 1}`,
    name: c.name.trim(),
    courtNumber: c.courtNumber,
    isActive: true,
  }));

  const joinCode = generateJoinCode();
  const scoreCode = generateJoinCode();
  const sessionRef = db.collection("sessions").doc();

  const batch = db.batch();

  batch.set(sessionRef, {
    groupId: squadId,
    venueId: null,
    venueName: input.venueName?.trim() ?? "",
    name: name.trim(),
    sport,
    status: "draft",
    startsAt: FieldValue.serverTimestamp(),
    durationMinutes,
    estimatedGameMinutes,
    courts: sessionCourts,
    courtCount: sessionCourts.length,
    scoringMode,
    createdBy: session.uid,
    currentRoundNumber: 0,
    joinCode,
    joinEnabled: true,
    scoreCode,
    scoreLinkEnabled: true,
    scheduleGeneratedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Write player sub-docs
  for (const p of players) {
    const playerRef = sessionRef.collection("players").doc(p.playerId);
    batch.set(playerRef, {
      playerId: p.playerId,
      displayName: p.displayName,
      skillLevel: p.skillLevel || "unknown",
      status: "active",
      participantType: "registered_user",
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      sitOutCount: 0,
      availableFromRound: 1,
    });
  }

  await batch.commit();

  return ok({ sessionId: sessionRef.id, joinCode, scoreCode });
}

// ── Session lifecycle helpers ─────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<string, { from: string[]; action: string }> = {
  active: { from: ["draft", "scheduled"], action: "session_started" },
  paused: { from: ["active"], action: "session_paused" },
  completed: { from: ["active", "paused"], action: "session_completed" },
};

export async function updateSessionStatus(
  sessionId: string,
  statusTo: "active" | "paused" | "completed",
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const transition = STATUS_TRANSITIONS[statusTo]!;
  const targetingActive = statusTo === "active";

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const round1Ref = db.doc(`sessions/${sessionId}/rounds/round_1`);

      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const data = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${data.groupId}/members/${session.uid}`));
      if (!memberSnap.exists) throw Object.assign(new Error("Not a squad member"), { code: "FORBIDDEN" });

      // "active" is reachable from a fresh session (real start, needs round_1
      // generated first) or from "paused" (resume, no such gate).
      const isStart = targetingActive && data.status !== "paused";
      const round1Snap = isStart ? await t.get(round1Ref) : null;

      if (!transition.from.includes(data.status)) {
        throw Object.assign(
          new Error(`Cannot transition to ${statusTo} from ${data.status}`),
          { code: "FAILED_PRECONDITION" },
        );
      }
      if (isStart && !round1Snap!.exists) {
        throw Object.assign(
          new Error("Generate a schedule before starting the session"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      t.update(sessionRef, {
        status: statusTo,
        ...(isStart ? { currentRoundNumber: 1 } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (isStart) {
        t.update(round1Ref, { status: "in_progress" });
      }

      const auditAction = targetingActive && !isStart ? "session_resumed" : transition.action;
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: session.uid,
        action: auditAction,
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

export interface AdvanceRoundResult {
  success: true;
  nextRound?: number;
  needsConfirmation?: boolean;
  pendingCount?: number;
}

export async function advanceRound(
  sessionId: string,
  force = false,
): Promise<ActionResult<AdvanceRoundResult>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const data = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${data.groupId}/members/${session.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canAdvanceRound(role)) {
        throw Object.assign(new Error("Must be a squad member to advance the round"), { code: "FORBIDDEN" });
      }

      if (data.status !== "active") {
        throw Object.assign(new Error("Session must be active to advance round"), { code: "FAILED_PRECONDITION" });
      }

      const currentRound = data.currentRoundNumber || 1;
      const currentRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${currentRound}`);
      const nextRound = currentRound + 1;
      const nextRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${nextRound}`);

      const matchesSnap = await t.get(db.collection(`sessions/${sessionId}/rounds/round_${currentRound}/matches`));
      const nextRoundSnap = await t.get(nextRoundRef);

      const pendingMatches = matchesSnap.docs.filter((d) => {
        const status = d.data().status;
        return status === "scheduled" || status === "in_progress";
      });

      if (pendingMatches.length > 0 && !force) {
        return { success: true as const, needsConfirmation: true, pendingCount: pendingMatches.length };
      }

      for (const matchDoc of pendingMatches) {
        t.update(matchDoc.ref, { status: "cancelled", isLocked: true });
      }
      t.update(currentRoundRef, { status: "completed" });
      if (nextRoundSnap.exists) {
        t.update(nextRoundRef, { status: "in_progress" });
      }
      t.update(sessionRef, { currentRoundNumber: nextRound });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: session.uid,
        action: "round_advanced",
        details: { fromRound: currentRound, toRound: nextRound, forced: !!force },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { success: true as const, nextRound };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }
}

export interface SessionSummaryData {
  id: string;
  name: string;
  sport: string;
  status: string;
  startsAt: string | null;
  venueName: string;
  courtCount: number;
  createdBy: string;
  groupId: string;
}

export async function getMySessionsAction(): Promise<ActionResult<{
  organising: SessionSummaryData[];
  playing: SessionSummaryData[];
}>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  const [orgSnap, playerSnap] = await Promise.all([
    db.collection("sessions").where("createdBy", "==", user.uid).orderBy("startsAt", "desc").get(),
    db.collectionGroup("players").where("playerId", "==", user.uid).get(),
  ]);

  const toSummary = (d: FirebaseFirestore.DocumentSnapshot): SessionSummaryData => {
    const data = d.data()!;
    const startsAt = data.startsAt?.toDate?.()?.toISOString() ?? null;
    return {
      id: d.id,
      name: data.name ?? "",
      sport: data.sport ?? "badminton",
      status: data.status ?? "draft",
      startsAt,
      venueName: data.venueName ?? "",
      courtCount: data.courtCount ?? 0,
      createdBy: data.createdBy ?? "",
      groupId: data.groupId ?? "",
    };
  };

  const organising = orgSnap.docs.map(toSummary);
  const orgIds = new Set(organising.map((s) => s.id));

  const playingSessionIds = [
    ...new Set(playerSnap.docs.map((d) => d.ref.parent.parent!.id)),
  ].filter((id) => !orgIds.has(id));

  const playingDocs = await Promise.all(
    playingSessionIds.map((id) => db.doc(`sessions/${id}`).get()),
  );
  const playing = playingDocs.filter((d) => d.exists).map(toSummary);

  return ok({ organising, playing });
}
