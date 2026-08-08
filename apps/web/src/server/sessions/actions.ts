"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import {
  generateJoinCode,
  canCreateSession,
  getSportConfig,
  type Sport,
  type ScoringMode,
} from "@picklebaddies/domain";
import { getAdminDb, getAdminAuth } from "@/server/firebase/admin";
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
  startsAtIso?: string;
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

  const startsAtDate = input.startsAtIso ? new Date(input.startsAtIso) : new Date();
  const isFuture = startsAtDate.getTime() > Date.now() + 60000;
  const initialStatus = isFuture ? "scheduled" : "draft";

  batch.set(sessionRef, {
    groupId: squadId,
    venueId: null,
    venueName: input.venueName?.trim() ?? "",
    name: name.trim(),
    sport,
    status: initialStatus,
    startsAt: input.startsAtIso ? startsAtDate : FieldValue.serverTimestamp(),
    durationMinutes,
    estimatedGameMinutes,
    courts: sessionCourts,
    courtCount: sessionCourts.length,
    scoringMode,
    createdBy: session.uid,
    rsvpGoingCount: 0,
    rsvpNotGoingCount: 0,
    joinCode,
    joinEnabled: true,
    scoreCode,
    scoreLinkEnabled: true,
    boardEnabled: true,
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

      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const data = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${data.groupId}/members/${session.uid}`));
      if (!memberSnap.exists) throw Object.assign(new Error("Not a squad member"), { code: "FORBIDDEN" });

      // "active" is reachable from a fresh session (real start, needs a
      // generated schedule first) or from "paused" (resume, no such gate).
      const isStart = targetingActive && data.status !== "paused";
      const firstMatchSnap = isStart
        ? await t.get(db.collection(`sessions/${sessionId}/matches`).limit(1))
        : null;

      if (!transition.from.includes(data.status)) {
        throw Object.assign(
          new Error(`Cannot transition to ${statusTo} from ${data.status}`),
          { code: "FAILED_PRECONDITION" },
        );
      }
      if (isStart && firstMatchSnap!.empty) {
        throw Object.assign(
          new Error("Generate a schedule before starting the session"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      t.update(sessionRef, {
        status: statusTo,
        updatedAt: FieldValue.serverTimestamp(),
      });

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

// ── deleteSession ─────────────────────────────────────────────────────────────

export async function deleteSession(sessionId: string): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const sessionData = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${sessionData.groupId}/members/${user.uid}`));
      if (!memberSnap.exists) throw Object.assign(new Error("Must be a squad member to delete a session"), { code: "FORBIDDEN" });

      t.update(sessionRef, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "session_deleted",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok(undefined);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    throw e;
  }
}

// ── rsvpToSession ─────────────────────────────────────────────────────────────

export async function rsvpToSession(
  sessionId: string,
  status: "going" | "not_going",
): Promise<ActionResult<{ rsvpGoingCount: number; rsvpNotGoingCount: number }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const auth = getAdminAuth();

  try {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return err("NOT_FOUND", "Session not found");
    const sessionData = sessionSnap.data()!;

    // Check membership (member doc, group memberIds array, or creator)
    const memberSnap = await db.doc(`groups/${sessionData.groupId}/members/${user.uid}`).get();
    const groupSnap = await db.doc(`groups/${sessionData.groupId}`).get();
    const groupData = groupSnap.exists ? groupSnap.data() : null;
    const isMember = memberSnap.exists ||
      (groupData?.memberIds && Array.isArray(groupData.memberIds) && groupData.memberIds.includes(user.uid)) ||
      groupData?.createdBy === user.uid;

    if (!isMember) return err("FORBIDDEN", "Must be a squad member to RSVP");

    const userRecord = await auth.getUser(user.uid).catch(() => null);
    const displayName = userRecord?.displayName?.trim() || userRecord?.email?.split("@")[0] || "Player";

    await db.runTransaction(async (t) => {
      const rsvpRef = db.doc(`sessions/${sessionId}/rsvps/${user.uid}`);
      const playerRef = db.doc(`sessions/${sessionId}/players/${user.uid}`);
      const leaderboardRef = db.doc(`sessions/${sessionId}/leaderboard/${user.uid}`);

      // ALL READS FIRST:
      const pSnap = await t.get(playerRef);

      // ALL WRITES SECOND:
      t.set(rsvpRef, {
        userId: user.uid,
        displayName,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      if (status === "going") {
        t.set(playerRef, {
          playerId: user.uid,
          displayName,
          skillLevel: "unknown",
          status: "active",
          participantType: "registered_user",
          joinedAt: FieldValue.serverTimestamp(),
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          sitOutCount: 0,
        }, { merge: true });

        t.set(leaderboardRef, {
          displayName,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDifference: 0,
          sitOutCount: 0,
        }, { merge: true });
      } else {
        if (pSnap.exists) {
          t.update(playerRef, { status: "left", updatedAt: FieldValue.serverTimestamp() });
        }
      }

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: `rsvp/${status}`,
        details: { displayName },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    // Re-count RSVPs for aggregation doc update
    const rsvpsSnap = await db.collection(`sessions/${sessionId}/rsvps`).get();
    let going = 0;
    let notGoing = 0;
    rsvpsSnap.docs.forEach((doc) => {
      const st = doc.data().status;
      if (st === "going") going++;
      else if (st === "not_going") notGoing++;
    });

    await sessionRef.update({
      rsvpGoingCount: going,
      rsvpNotGoingCount: notGoing,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return ok({ rsvpGoingCount: going, rsvpNotGoingCount: notGoing });
  } catch (e: any) {
    console.error("rsvpToSession error:", e);
    return err("INTERNAL", e.message || "Failed to RSVP");
  }
}

// ── getGroupSessionsAction ───────────────────────────────────────────────────

export async function getGroupSessionsAction(groupId: string): Promise<ActionResult<any[]>> {
  const db = getAdminDb();
  try {
    const snap = await db.collection("sessions").where("groupId", "==", groupId).get();
    const list = snap.docs.map((d) => {
      const data = d.data();
      let startsAtDate = data.startsAt;
      if (startsAtDate && typeof startsAtDate.toDate === "function") {
        startsAtDate = startsAtDate.toDate();
      }
      return {
        id: d.id,
        ...data,
        startsAt: startsAtDate,
      };
    });

    list.sort((a, b) => {
      const getMs = (val: any) => {
        if (!val) return 0;
        if (typeof val.getTime === "function") return val.getTime();
        return new Date(val).getTime() || 0;
      };
      return getMs(b.startsAt) - getMs(a.startsAt);
    });

    return ok(list);
  } catch (e: any) {
    return err("INTERNAL", e.message);
  }
}

// ── addCourtToSession ─────────────────────────────────────────────────────────

export async function addCourtToSession(
  sessionId: string,
  courtName: string,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!courtName || courtName.trim().length < 1) {
    return err("INVALID_ARGUMENT", "Court name is required");
  }

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!role || (role !== "owner" && role !== "organiser")) {
        throw Object.assign(new Error("Must be an organiser to add courts"), { code: "FORBIDDEN" });
      }

      const existingCourts: any[] = session.courts || [];
      const newCourtNumber = existingCourts.length + 1;
      const newCourt = {
        courtId: `court_${Date.now()}`,
        name: courtName.trim(),
        courtNumber: newCourtNumber,
        isActive: true,
      };

      t.update(sessionRef, {
        courts: [...existingCourts, newCourt],
        courtCount: existingCourts.length + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "court/added",
        details: { courtName: courtName.trim(), courtNumber: newCourtNumber },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok(undefined);
  } catch (e: any) {
    console.error("addCourtToSession error:", e);
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    return err("INTERNAL", e.message || "Failed to add court");
  }
}

