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

export async function updateSessionStatus(
  sessionId: string,
  statusTo: "active" | "paused" | "completed",
): Promise<ActionResult<void>> {
  const session = await requireSession().catch(() => null);
  if (!session) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();
  const sessionRef = db.doc(`sessions/${sessionId}`);
  const snap = await sessionRef.get();
  if (!snap.exists) return err("NOT_FOUND", "Session not found");

  const memberSnap = await db
    .doc(`groups/${snap.data()!.groupId}/members/${session.uid}`)
    .get();
  if (!memberSnap.exists) return err("FORBIDDEN", "Not a squad member");

  await sessionRef.update({
    status: statusTo,
    ...(statusTo === "active" ? { currentRoundNumber: 1 } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

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
