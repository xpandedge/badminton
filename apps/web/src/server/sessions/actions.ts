"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import {
  generateJoinCode,
  canCreateSession,
  canDeleteSession,
  canManageGroup,
  canManageSessionPlayers,
  getSportConfig,
  type GroupRole,
  type Sport,
  type ScoringMode,
  type SessionRsvpCapacity,
  type RsvpResponse,
  type SquadPlayerKind,
  buildSessionRsvpBuckets,
  type SessionRsvpEntry,
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

export interface SessionRsvpCapacityInput {
  totalPlayers: number;
  casualConfirmedSlots: number;
  waitlistEnabled: boolean;
  cutoffAt?: Date | string | null;
}

function normalizeSessionRsvpCapacity(input: {
  totalPlayers?: unknown;
  casualConfirmedSlots?: unknown;
  waitlistEnabled?: unknown;
}): SessionRsvpCapacity {
  const totalPlayers = Math.trunc(Number(input.totalPlayers ?? 11));
  const casualConfirmedSlots = Math.trunc(Number(input.casualConfirmedSlots ?? 3));
  if (!Number.isFinite(totalPlayers) || totalPlayers < 4) {
    throw Object.assign(new Error("Total player capacity must be at least 4"), { code: "INVALID_ARGUMENT" });
  }
  if (!Number.isFinite(casualConfirmedSlots) || casualConfirmedSlots < 0) {
    throw Object.assign(new Error("Casual confirmed slots cannot be negative"), { code: "INVALID_ARGUMENT" });
  }
  if (casualConfirmedSlots > totalPlayers) {
    throw Object.assign(new Error("Casual confirmed slots cannot exceed total capacity"), {
      code: "INVALID_ARGUMENT",
    });
  }
  return {
    totalPlayers,
    casualConfirmedSlots,
    waitlistEnabled: input.waitlistEnabled !== false,
  };
}

function buildRsvpCapacitySnapshot(
  defaults: Record<string, unknown> | undefined,
  startsAtDate: Date,
): SessionRsvpCapacity & { cutoffAt: Date | null } {
  const capacity = normalizeSessionRsvpCapacity(defaults ?? {});
  const cutoffHoursBeforeStart = defaults?.cutoffHoursBeforeStart;
  const cutoffHours = cutoffHoursBeforeStart === null || cutoffHoursBeforeStart === undefined
    ? null
    : Math.trunc(Number(cutoffHoursBeforeStart));
  const cutoffAt = cutoffHours !== null && Number.isFinite(cutoffHours) && cutoffHours > 0
    ? new Date(startsAtDate.getTime() - cutoffHours * 60 * 60 * 1000)
    : null;
  return { ...capacity, cutoffAt };
}

function toDateFromFirestore(value: unknown): Date {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  const parsed = value ? new Date(value as string) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function createSession(
  input: CreateSessionInput,
): Promise<ActionResult<{ sessionId: string; joinCode: string; scoreCode: string; rsvpCode: string }>> {
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
  const [memberSnap, groupSnap] = await Promise.all([
    db.doc(`groups/${squadId}/members/${session.uid}`).get(),
    db.doc(`groups/${squadId}`).get(),
  ]);
  const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
  if (!canCreateSession(role)) {
    return err("FORBIDDEN", "Only group owners and admins can create sessions");
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
  const rsvpCode = generateJoinCode();
  const sessionRef = db.collection("sessions").doc();

  const batch = db.batch();

  const startsAtDate = input.startsAtIso ? new Date(input.startsAtIso) : new Date();
  const isFuture = startsAtDate.getTime() > Date.now() + 60000;
  const initialStatus = isFuture ? "scheduled" : "draft";
  const groupData = groupSnap.exists ? groupSnap.data() : {};
  const rsvpCapacity = buildRsvpCapacitySnapshot(groupData?.rsvpDefaults, startsAtDate);

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
    rsvpCode,
    rsvpEnabled: true,
    rsvpCapacity,
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

  return ok({ sessionId: sessionRef.id, joinCode, scoreCode, rsvpCode });
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
      const role = memberSnap.exists
        ? (memberSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      if (!canCreateSession(role)) {
        throw Object.assign(
          new Error("Only group owners and admins can run sessions"),
          { code: "FORBIDDEN" },
        );
      }

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
  rsvpGoingCount: number;
  rsvpNotGoingCount: number;
  myRsvpStatus: "going" | "not_going" | null;
  myRsvpResponse: RsvpResponse | null;
  myPlayerKind: SquadPlayerKind;
}

type LegacyRsvpStatus = "going" | "not_going";
type SignedInRsvpStatus = LegacyRsvpStatus | RsvpResponse;

function responseToLegacyStatus(response: RsvpResponse | null): LegacyRsvpStatus | null {
  if (response === "in" || response === "casual_joined") return "going";
  if (response === "away" || response === "removed") return "not_going";
  return null;
}

function normalizeSignedInRsvpStatus(status: SignedInRsvpStatus, playerKind: SquadPlayerKind): RsvpResponse {
  if (status === "going") return playerKind === "regular" ? "in" : "casual_joined";
  if (status === "not_going") return playerKind === "regular" ? "away" : "removed";
  return status;
}

function timestampToMs(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return new Date(value as string).getTime() || 0;
}

export async function getMySessionsAction(): Promise<ActionResult<{
  organising: SessionSummaryData[];
  playing: SessionSummaryData[];
}>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  const [groupSnap, playerSnap] = await Promise.all([
    db.collection("groups").where("memberIds", "array-contains", user.uid).get(),
    db.collectionGroup("players").where("playerId", "==", user.uid).get(),
  ]);

  const groupRoles = await Promise.all(
    groupSnap.docs.map(async (groupDoc) => {
      const membership = await db.doc(`groups/${groupDoc.id}/members/${user.uid}`).get();
      const role = membership.exists
        ? (membership.data() as { role?: GroupRole }).role ?? null
        : null;
      return { groupId: groupDoc.id, role };
    }),
  );
  const groupPlayerSnaps = groupRoles.length > 0
    ? await db.getAll(...groupRoles.map(({ groupId }) => db.doc(`groups/${groupId}/players/${user.uid}`)))
    : [];
  const playerKindByGroupId = new Map<string, SquadPlayerKind>(
    groupPlayerSnaps.map((snap) => {
      const kind = snap.exists ? snap.data()?.playerKind : null;
      return [snap.ref.parent.parent!.id, kind === "casual" ? "casual" : "regular"];
    }),
  );
  const managedGroupIds = new Set(groupRoles
    .filter(({ role }) => canManageGroup(role))
    .map(({ groupId }) => groupId));
  const allSessionSnaps = await Promise.all(
    groupRoles.map(({ groupId }) =>
      db.collection("sessions").where("groupId", "==", groupId).get()
    ),
  );

  const allDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const snapshot of allSessionSnaps) {
    for (const sessionDoc of snapshot.docs) allDocs.set(sessionDoc.id, sessionDoc);
  }

  const sessionIds = [...allDocs.keys()];
  const rsvpSnaps = sessionIds.length > 0
    ? await db.getAll(...sessionIds.map((id) => db.doc(`sessions/${id}/rsvps/${user.uid}`)))
    : [];
  const rsvpBySessionId = new Map(
    rsvpSnaps.map((snap) => [snap.ref.parent.parent!.id, snap.exists ? snap.data() : null]),
  );
  const playerBySessionId = new Map(
    playerSnap.docs.map((snap) => [snap.ref.parent.parent!.id, snap.data()]),
  );

  const toSummary = (d: FirebaseFirestore.DocumentSnapshot): SessionSummaryData => {
    const data = d.data()!;
    const startsAt = data.startsAt?.toDate?.()?.toISOString() ?? null;
    const rsvpData = rsvpBySessionId.get(d.id);
    const explicitResponse = (rsvpData?.response as RsvpResponse | undefined) ?? null;
    const explicitLegacyStatus = rsvpData?.status as LegacyRsvpStatus | undefined;
    const sessionPlayer = playerBySessionId.get(d.id);
    const inferredRsvp = sessionPlayer?.status === "active" || sessionPlayer?.status === "checked_in"
      ? "going"
      : sessionPlayer?.status === "left"
        ? "not_going"
        : null;
    const playerKind = playerKindByGroupId.get(data.groupId) ?? "regular";
    const responseFromLegacy = explicitLegacyStatus === "going"
      ? playerKind === "regular" ? "in" : "casual_joined"
      : explicitLegacyStatus === "not_going"
        ? playerKind === "regular" ? "away" : "removed"
        : null;
    const myRsvpResponse = explicitResponse ?? responseFromLegacy;
    const explicitRsvp = responseToLegacyStatus(myRsvpResponse) ?? explicitLegacyStatus ?? null;
    const defaultRegularRsvp = !explicitRsvp && playerKind === "regular" && (data.status === "draft" || data.status === "scheduled")
      ? "going"
      : null;
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
      rsvpGoingCount: data.rsvpGoingCount ?? 0,
      rsvpNotGoingCount: data.rsvpNotGoingCount ?? 0,
      myRsvpStatus: explicitRsvp === "going" || explicitRsvp === "not_going" ? explicitRsvp : defaultRegularRsvp ?? inferredRsvp,
      myRsvpResponse,
      myPlayerKind: playerKind,
    };
  };

  const organising = [...allDocs.values()]
    .filter((sessionDoc) => managedGroupIds.has(sessionDoc.data().groupId))
    .map(toSummary);
  const playing = [...allDocs.values()]
    .filter((sessionDoc) => !managedGroupIds.has(sessionDoc.data().groupId))
    .map(toSummary);

  return ok({ organising, playing });
}

// ── Session RSVP capacity ────────────────────────────────────────────────────

export async function updateSessionRsvpCapacity(
  sessionId: string,
  input: SessionRsvpCapacityInput,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  let capacity: SessionRsvpCapacity & { cutoffAt: Date | null };
  try {
    const normalized = normalizeSessionRsvpCapacity(input);
    const cutoffAt = input.cutoffAt
      ? input.cutoffAt instanceof Date
        ? input.cutoffAt
        : new Date(input.cutoffAt)
      : null;
    if (cutoffAt && Number.isNaN(cutoffAt.getTime())) {
      throw Object.assign(new Error("RSVP cutoff is not a valid date"), { code: "INVALID_ARGUMENT" });
    }
    capacity = { ...normalized, cutoffAt };
  } catch (error: any) {
    if (error.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", error.message);
    throw error;
  }

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const data = sessionSnap.data()!;
      const memberSnap = await t.get(db.doc(`groups/${data.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Only squad owners and admins can change RSVP capacity"), {
          code: "FORBIDDEN",
        });
      }
      if (data.status !== "draft" && data.status !== "scheduled") {
        throw Object.assign(new Error("RSVP capacity can only change before the session starts"), {
          code: "FAILED_PRECONDITION",
        });
      }

      t.set(sessionRef, {
        rsvpEnabled: true,
        rsvpCapacity: capacity,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "rsvp/capacity_updated",
        details: capacity,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return ok(undefined);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    if (error.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", error.message);
    throw error;
  }
}

export async function ensureSessionRsvpLink(
  sessionId: string,
): Promise<ActionResult<{ rsvpCode: string }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const sessionData = sessionSnap.data()!;
      const [memberSnap, groupSnap] = await Promise.all([
        t.get(db.doc(`groups/${sessionData.groupId}/members/${user.uid}`)),
        t.get(db.doc(`groups/${sessionData.groupId}`)),
      ]);
      const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Only squad owners and admins can create RSVP links"), {
          code: "FORBIDDEN",
        });
      }

      const existingCode = typeof sessionData.rsvpCode === "string" ? sessionData.rsvpCode.trim() : "";
      if (existingCode) {
        if (sessionData.rsvpEnabled !== true) {
          t.set(sessionRef, {
            rsvpEnabled: true,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: user.uid,
          }, { merge: true });
        }
        return { rsvpCode: existingCode };
      }

      const rsvpCode = generateJoinCode();
      const startsAtDate = toDateFromFirestore(sessionData.startsAt);
      const groupData = groupSnap.exists ? groupSnap.data() : {};
      const rsvpCapacity = sessionData.rsvpCapacity
        ? {
            totalPlayers: Number(sessionData.rsvpCapacity.totalPlayers ?? 11),
            casualConfirmedSlots: Number(sessionData.rsvpCapacity.casualConfirmedSlots ?? 3),
            waitlistEnabled: sessionData.rsvpCapacity.waitlistEnabled !== false,
            cutoffAt: sessionData.rsvpCapacity.cutoffAt ?? null,
          }
        : buildRsvpCapacitySnapshot(groupData?.rsvpDefaults, startsAtDate);

      t.set(sessionRef, {
        rsvpCode,
        rsvpEnabled: true,
        rsvpCapacity,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "rsvp/link_created",
        details: { rsvpCode },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { rsvpCode };
    });

    return ok(result);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    throw error;
  }
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
      const role = memberSnap.exists
        ? (memberSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      if (!canDeleteSession(role)) {
        throw Object.assign(
          new Error("Only group owners and admins can cancel a session"),
          { code: "FORBIDDEN" },
        );
      }

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
  status: SignedInRsvpStatus,
): Promise<ActionResult<{
  status: LegacyRsvpStatus;
  response: RsvpResponse;
  rsvpGoingCount: number;
  rsvpNotGoingCount: number;
}>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const auth = getAdminAuth();

  try {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return err("NOT_FOUND", "Session not found");
    const sessionData = sessionSnap.data()!;
    if (sessionData.status !== "draft" && sessionData.status !== "scheduled") {
      return err("FAILED_PRECONDITION", "RSVPs close when the session starts");
    }

    // Check membership (member doc, group memberIds array, or creator)
    const [memberSnap, groupSnap, groupPlayerSnap] = await Promise.all([
      db.doc(`groups/${sessionData.groupId}/members/${user.uid}`).get(),
      db.doc(`groups/${sessionData.groupId}`).get(),
      db.doc(`groups/${sessionData.groupId}/players/${user.uid}`).get(),
    ]);
    const groupData = groupSnap.exists ? groupSnap.data() : null;
    const isMember = memberSnap.exists ||
      (groupData?.memberIds && Array.isArray(groupData.memberIds) && groupData.memberIds.includes(user.uid)) ||
      groupData?.createdBy === user.uid;

    if (!isMember) return err("FORBIDDEN", "Must be a squad member to RSVP");

    const userRecord = await auth.getUser(user.uid).catch(() => null);
    const groupPlayer = groupPlayerSnap.exists ? groupPlayerSnap.data() : null;
    const playerKind: SquadPlayerKind = groupPlayer?.playerKind === "casual" ? "casual" : "regular";
    const response = normalizeSignedInRsvpStatus(status, playerKind);
    const legacyStatus = responseToLegacyStatus(response);
    if (!legacyStatus) return err("INVALID_ARGUMENT", "Choose a valid RSVP status");
    const displayName = (groupPlayer?.displayName as string | undefined)?.trim()
      || userRecord?.displayName?.trim()
      || "Player";

    const result = await db.runTransaction(async (t) => {
      const rsvpRef = db.doc(`sessions/${sessionId}/rsvps/${user.uid}`);
      const playerRef = db.doc(`sessions/${sessionId}/players/${user.uid}`);
      const leaderboardRef = db.doc(`sessions/${sessionId}/leaderboard/${user.uid}`);

      // ALL READS FIRST:
      const [freshSessionSnap, rsvpSnap, pSnap, leaderboardSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(rsvpRef),
        t.get(playerRef),
        t.get(leaderboardRef),
      ]);
      if (!freshSessionSnap.exists) {
        throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      }
      const freshSession = freshSessionSnap.data()!;
      if (freshSession.status !== "draft" && freshSession.status !== "scheduled") {
        throw Object.assign(new Error("RSVPs close when the session starts"), { code: "FAILED_PRECONDITION" });
      }

      // ALL WRITES SECOND:
      t.set(rsvpRef, {
        userId: user.uid,
        displayName,
        status: legacyStatus,
        response,
        playerKind,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      if (response === "in") {
        const existingPlayer = pSnap.data() ?? {};
        const playerUpdate: Record<string, unknown> = {
          playerId: user.uid,
          displayName,
          skillLevel: existingPlayer.skillLevel ?? groupPlayer?.skillLevel ?? "unknown",
          status: "active",
          participantType: "registered_user",
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!pSnap.exists) {
          Object.assign(playerUpdate, {
            joinedAt: FieldValue.serverTimestamp(),
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            sitOutCount: 0,
          });
        }
        t.set(playerRef, playerUpdate, { merge: true });

        const leaderboardUpdate: Record<string, unknown> = {
          displayName,
        };
        if (!leaderboardSnap.exists) {
          Object.assign(leaderboardUpdate, {
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            pointDifference: 0,
            sitOutCount: 0,
          });
        }
        t.set(leaderboardRef, leaderboardUpdate, { merge: true });
      } else {
        if (pSnap.exists) {
          t.update(playerRef, { status: "left", updatedAt: FieldValue.serverTimestamp() });
        }
      }

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: `rsvp/${response}`,
        details: { displayName, playerKind },
        createdAt: FieldValue.serverTimestamp(),
      });

      const previousResponse = (rsvpSnap.exists ? rsvpSnap.data()?.response : null) as RsvpResponse | null;
      const previousStatus = responseToLegacyStatus(previousResponse)
        ?? (rsvpSnap.exists ? rsvpSnap.data()?.status : null);
      let going = Number(freshSession.rsvpGoingCount ?? 0);
      let notGoing = Number(freshSession.rsvpNotGoingCount ?? 0);
      if (previousStatus !== legacyStatus) {
        if (previousStatus === "going") going = Math.max(0, going - 1);
        if (previousStatus === "not_going") notGoing = Math.max(0, notGoing - 1);
        if (legacyStatus === "going") going += 1;
        else notGoing += 1;
      }
      t.update(sessionRef, {
        rsvpGoingCount: going,
        rsvpNotGoingCount: notGoing,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { status: legacyStatus, response, rsvpGoingCount: going, rsvpNotGoingCount: notGoing };
    });

    return ok(result);
  } catch (e: any) {
    console.error("rsvpToSession error:", e);
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    return err("INTERNAL", e.message || "Failed to RSVP");
  }
}

// ── syncConfirmedRsvpsToSessionPlayers ──────────────────────────────────────

type SyncableRsvpEntry = SessionRsvpEntry & {
  playerId: string;
  skillLevel: string;
  participantType: "registered_user" | "guest";
};

type AdminRsvpEntry = SyncableRsvpEntry & {
  rsvpId: string;
  isPublic: boolean;
};

export interface SessionRsvpAdminRoster {
  regularsIn: Array<{ displayName: string }>;
  regularsAway: Array<{ displayName: string }>;
  casualsConfirmed: Array<{
    rsvpId: string;
    displayName: string;
    isPublic: boolean;
    adminOverride?: "confirmed" | "waiting";
  }>;
  casualsWaiting: Array<{
    rsvpId: string;
    displayName: string;
    isPublic: boolean;
    adminOverride?: "confirmed" | "waiting";
  }>;
  guestRequests: Array<{
    rsvpId: string;
    displayName: string;
    isPublic: true;
  }>;
}

function rsvpStatusToResponse(
  status: unknown,
  playerKind: SquadPlayerKind,
): RsvpResponse | undefined {
  if (status === "going") return playerKind === "regular" ? "in" : "casual_joined";
  if (status === "not_going") return playerKind === "regular" ? "away" : "removed";
  return undefined;
}

function buildAdminRsvpEntry(
  playerDoc: FirebaseFirestore.QueryDocumentSnapshot,
  rsvp: FirebaseFirestore.DocumentData | null | undefined,
  playerKind: SquadPlayerKind,
): AdminRsvpEntry {
  const player = playerDoc.data();
  return {
    id: rsvp?.id ?? playerDoc.id,
    rsvpId: rsvp?.id ?? playerDoc.id,
    playerId: playerDoc.id,
    displayName: String(player.displayName ?? "Player").trim() || "Player",
    response: (rsvp?.response as RsvpResponse | undefined) ?? rsvpStatusToResponse(rsvp?.status, playerKind),
    joinedAtMs: timestampToMs(rsvp?.createdAt ?? rsvp?.updatedAt),
    adminOverride: rsvp?.adminOverride,
    skillLevel: String(player.skillLevel ?? "unknown"),
    participantType: "registered_user",
    isPublic: false,
  };
}

async function readAdminRsvpRosterData(
  db: FirebaseFirestore.Firestore,
  sessionId: string,
): Promise<{
  sessionData: FirebaseFirestore.DocumentData;
  regulars: AdminRsvpEntry[];
  casuals: AdminRsvpEntry[];
  guestRequests: AdminRsvpEntry[];
}> {
  const sessionSnap = await db.doc(`sessions/${sessionId}`).get();
  if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
  const sessionData = sessionSnap.data()!;
  const [groupPlayersSnap, rsvpsSnap] = await Promise.all([
    db.collection(`groups/${sessionData.groupId}/players`).get(),
    db.collection(`sessions/${sessionId}/rsvps`).get(),
  ]);
  const rsvpById = new Map(rsvpsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const regulars: AdminRsvpEntry[] = [];
  const casuals: AdminRsvpEntry[] = [];
  const guestRequests: AdminRsvpEntry[] = [];

  for (const playerDoc of groupPlayersSnap.docs) {
    const player = playerDoc.data();
    const playerKind: SquadPlayerKind = player.playerKind === "casual" ? "casual" : "regular";
    const rsvp = rsvpById.get(playerDoc.id) ?? (player.userId ? rsvpById.get(player.userId) : null);
    const entry = buildAdminRsvpEntry(playerDoc, rsvp, playerKind);
    if (playerKind === "regular") regulars.push(entry);
    else if (entry.response === "casual_joined") casuals.push(entry);
  }

  for (const rsvpDoc of rsvpsSnap.docs) {
    const rsvp = rsvpDoc.data();
    if (rsvp.participantType !== "public_casual") continue;
    const publicEntry: AdminRsvpEntry = {
      id: rsvpDoc.id,
      rsvpId: rsvpDoc.id,
      playerId: rsvpDoc.id,
      displayName: String(rsvp.displayName ?? "Player").trim() || "Player",
      response: rsvp.response,
      joinedAtMs: timestampToMs(rsvp.createdAt ?? rsvp.updatedAt),
      adminOverride: rsvp.adminOverride,
      skillLevel: "unknown",
      participantType: "guest",
      isPublic: true,
    };
    if (rsvp.response === "guest_requested") {
      guestRequests.push(publicEntry);
    } else if (rsvp.response === "casual_joined") {
      casuals.push(publicEntry);
    }
  }

  return { sessionData, regulars, casuals, guestRequests };
}

export async function getSessionRsvpAdminRoster(
  sessionId: string,
): Promise<ActionResult<SessionRsvpAdminRoster>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  try {
    const { sessionData, regulars, casuals, guestRequests } = await readAdminRsvpRosterData(db, sessionId);
    const memberSnap = await db.doc(`groups/${sessionData.groupId}/members/${user.uid}`).get();
    const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
    if (!canManageSessionPlayers(role)) {
      return err("FORBIDDEN", "Only squad owners and admins can manage the RSVP roster");
    }

    const capacity = sessionData.rsvpCapacity ?? {};
    const buckets = buildSessionRsvpBuckets({
      capacity: {
        totalPlayers: Number(capacity.totalPlayers ?? 11),
        casualConfirmedSlots: Number(capacity.casualConfirmedSlots ?? 3),
        waitlistEnabled: capacity.waitlistEnabled !== false,
      },
      regulars,
      casuals,
    });
    const mapCasual = (entry: SessionRsvpEntry) => {
      const adminEntry = entry as AdminRsvpEntry;
      return {
        rsvpId: adminEntry.rsvpId,
        displayName: adminEntry.displayName,
        isPublic: adminEntry.isPublic,
        adminOverride: adminEntry.adminOverride,
      };
    };

    return ok({
      regularsIn: buckets.regularsIn.map((entry) => ({ displayName: entry.displayName })),
      regularsAway: buckets.regularsAway.map((entry) => ({ displayName: entry.displayName })),
      casualsConfirmed: buckets.casualsConfirmed.map(mapCasual),
      casualsWaiting: buckets.casualsWaiting.map(mapCasual),
      guestRequests: guestRequests
        .sort((a, b) => (a.joinedAtMs ?? 0) - (b.joinedAtMs ?? 0))
        .map((entry) => ({
          rsvpId: entry.rsvpId,
          displayName: entry.displayName,
          isPublic: true,
        })),
    });
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    throw error;
  }
}

async function updateCasualRsvpOverride(
  sessionId: string,
  rsvpId: string,
  override: "confirmed" | "waiting" | "removed",
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const rsvpRef = db.doc(`sessions/${sessionId}/rsvps/${rsvpId}`);
      const playerRef = db.doc(`sessions/${sessionId}/players/${rsvpId}`);
      const [sessionSnap, rsvpSnap, playerSnap] = await Promise.all([
        t.get(sessionRef),
        t.get(rsvpRef),
        t.get(playerRef),
      ]);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      if (!rsvpSnap.exists) throw Object.assign(new Error("RSVP entry not found"), { code: "NOT_FOUND" });
      const sessionData = sessionSnap.data()!;
      const memberSnap = await t.get(db.doc(`groups/${sessionData.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Only squad owners and admins can manage the RSVP roster"), {
          code: "FORBIDDEN",
        });
      }

      if (override === "removed") {
        t.set(rsvpRef, {
          response: "removed",
          status: "not_going",
          adminOverride: FieldValue.delete(),
          removedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        }, { merge: true });
        if (playerSnap.exists) {
          t.update(playerRef, { status: "left", updatedAt: FieldValue.serverTimestamp() });
        }
      } else {
        const rsvpData = rsvpSnap.data()!;
        const shouldApproveGuestRequest = rsvpData.response === "guest_requested";
        t.set(rsvpRef, {
          ...(shouldApproveGuestRequest ? {
            response: "casual_joined",
            status: "going",
            approvedAt: FieldValue.serverTimestamp(),
          } : {}),
          adminOverride: override,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: user.uid,
        }, { merge: true });
        if (override === "waiting" && playerSnap.exists) {
          t.update(playerRef, { status: "waiting", updatedAt: FieldValue.serverTimestamp() });
        }
      }

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: override === "removed" ? "rsvp/removed" : `rsvp/${override}`,
        details: { rsvpId },
        createdAt: FieldValue.serverTimestamp(),
      });
      t.update(sessionRef, { updatedAt: FieldValue.serverTimestamp() });
    });
    return ok(undefined);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    throw error;
  }
}

export async function promoteCasualRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>> {
  return updateCasualRsvpOverride(sessionId, rsvpId, "confirmed");
}

export async function approveGuestRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>> {
  return updateCasualRsvpOverride(sessionId, rsvpId, "confirmed");
}

export async function demoteCasualRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>> {
  return updateCasualRsvpOverride(sessionId, rsvpId, "waiting");
}

export async function removeCasualRsvp(sessionId: string, rsvpId: string): Promise<ActionResult<void>> {
  return updateCasualRsvpOverride(sessionId, rsvpId, "removed");
}

export async function syncConfirmedRsvpsToSessionPlayers(
  sessionId: string,
): Promise<ActionResult<{ added: number; waiting: number }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const sessionData = sessionSnap.data()!;

      const [memberSnap, groupPlayersSnap, rsvpsSnap, sessionPlayersSnap] = await Promise.all([
        t.get(db.doc(`groups/${sessionData.groupId}/members/${user.uid}`)),
        t.get(db.collection(`groups/${sessionData.groupId}/players`)),
        t.get(db.collection(`sessions/${sessionId}/rsvps`)),
        t.get(db.collection(`sessions/${sessionId}/players`)),
      ]);
      const role = memberSnap.exists ? (memberSnap.data() as { role?: GroupRole }).role ?? null : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Only squad owners and admins can sync the RSVP roster"), {
          code: "FORBIDDEN",
        });
      }
      if (sessionData.status !== "draft" && sessionData.status !== "scheduled") {
        throw Object.assign(new Error("Sync the RSVP roster before the session starts"), {
          code: "FAILED_PRECONDITION",
        });
      }

      const rsvpByUserId = new Map(rsvpsSnap.docs.map((doc) => [doc.id, doc.data()]));
      const regulars: SyncableRsvpEntry[] = [];
      const casuals: SyncableRsvpEntry[] = [];

      for (const playerDoc of groupPlayersSnap.docs) {
        const player = playerDoc.data();
        const playerKind: SquadPlayerKind = player.playerKind === "casual" ? "casual" : "regular";
        const rsvp = rsvpByUserId.get(playerDoc.id) ?? (player.userId ? rsvpByUserId.get(player.userId) : null);
        const response = (rsvp?.response as RsvpResponse | undefined)
          ?? (rsvp?.status === "going"
            ? playerKind === "regular" ? "in" : "casual_joined"
            : rsvp?.status === "not_going"
              ? playerKind === "regular" ? "away" : "removed"
              : undefined);
        const entry: SyncableRsvpEntry = {
          id: playerDoc.id,
          playerId: playerDoc.id,
          displayName: String(player.displayName ?? "Player").trim() || "Player",
          response,
          joinedAtMs: timestampToMs(rsvp?.createdAt ?? rsvp?.updatedAt),
          adminOverride: rsvp?.adminOverride,
          skillLevel: String(player.skillLevel ?? "unknown"),
          participantType: "registered_user",
        };
        if (playerKind === "regular") regulars.push(entry);
        else if (response === "casual_joined") casuals.push(entry);
      }

      for (const rsvpDoc of rsvpsSnap.docs) {
        const rsvp = rsvpDoc.data();
        if (rsvp.participantType !== "public_casual" || rsvp.response !== "casual_joined") continue;
        casuals.push({
          id: rsvpDoc.id,
          playerId: rsvpDoc.id,
          displayName: String(rsvp.displayName ?? "Player").trim() || "Player",
          response: "casual_joined",
          joinedAtMs: timestampToMs(rsvp.createdAt ?? rsvp.updatedAt),
          adminOverride: rsvp.adminOverride,
          skillLevel: "unknown",
          participantType: "guest",
        });
      }

      const capacity = sessionData.rsvpCapacity ?? {};
      const buckets = buildSessionRsvpBuckets({
        capacity: {
          totalPlayers: Number(capacity.totalPlayers ?? 11),
          casualConfirmedSlots: Number(capacity.casualConfirmedSlots ?? 3),
          waitlistEnabled: capacity.waitlistEnabled !== false,
        },
        regulars,
        casuals,
      });
      const confirmedEntries = [...buckets.regularsIn, ...buckets.casualsConfirmed] as SyncableRsvpEntry[];
      const waitingEntries = buckets.casualsWaiting as SyncableRsvpEntry[];
      const existingPlayerIds = new Set(sessionPlayersSnap.docs.map((doc) => doc.id));

      for (const entry of confirmedEntries) {
        const playerRef = db.doc(`sessions/${sessionId}/players/${entry.playerId}`);
        const playerExists = existingPlayerIds.has(entry.playerId);
        t.set(playerRef, {
          playerId: entry.playerId,
          displayName: entry.displayName,
          skillLevel: entry.skillLevel || "unknown",
          status: "active",
          participantType: entry.participantType,
          updatedAt: FieldValue.serverTimestamp(),
          ...(playerExists ? {} : {
            joinedAt: FieldValue.serverTimestamp(),
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            sitOutCount: 0,
            availableFromRound: 1,
          }),
        }, { merge: true });
      }

      for (const entry of waitingEntries) {
        if (existingPlayerIds.has(entry.playerId)) {
          t.update(db.doc(`sessions/${sessionId}/players/${entry.playerId}`), {
            status: "waiting",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      t.update(sessionRef, {
        rsvpSyncedAt: FieldValue.serverTimestamp(),
        rsvpConfirmedCount: confirmedEntries.length,
        rsvpWaitingCount: waitingEntries.length,
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "rsvp/synced_to_players",
        details: { confirmed: confirmedEntries.length, waiting: waitingEntries.length },
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        added: confirmedEntries.filter((entry) => !existingPlayerIds.has(entry.playerId)).length,
        waiting: waitingEntries.length,
      };
    });

    return ok(result);
  } catch (error: any) {
    if (error.code === "NOT_FOUND") return err("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return err("FORBIDDEN", error.message);
    if (error.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", error.message);
    throw error;
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
      const role = memberSnap.exists
        ? (memberSnap.data() as { role?: GroupRole }).role ?? null
        : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(
          new Error("Only group owners and admins can add courts"),
          { code: "FORBIDDEN" },
        );
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
