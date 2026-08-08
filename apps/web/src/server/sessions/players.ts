"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canManageSessionPlayers, isSchedulable, isSkillLevel, type SessionPlayerStatus } from "@picklebaddies/domain";
import { getAdminDb } from "@/server/firebase/admin";
import { requireSession } from "@/server/auth/dal";
import { ok, err, type ActionResult } from "@/server/result";

/**
 * Adds any group player (including the caller themselves) to a session.
 * Works for draft, active, and paused sessions.
 * Caller must be a member of the team that owns the session.
 * Target player must exist in that team's players subcollection.
 */
export async function addGroupMemberToSession(
  sessionId: string,
  targetPlayerId: string,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const callerMemberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      if (!callerMemberSnap.exists) {
        throw Object.assign(new Error("You must be a team member to join this session"), { code: "FORBIDDEN" });
      }

      if (session.status === "completed" || session.status === "cancelled") {
        throw Object.assign(
          new Error("Cannot add players to a completed or cancelled session"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      const groupPlayerSnap = await t.get(db.doc(`groups/${session.groupId}/players/${targetPlayerId}`));
      if (!groupPlayerSnap.exists) {
        throw Object.assign(new Error("Player not found in this team"), { code: "NOT_FOUND" });
      }
      const groupPlayer = groupPlayerSnap.data()!;

      const sessionPlayerRef = db.doc(`sessions/${sessionId}/players/${targetPlayerId}`);
      const existing = await t.get(sessionPlayerRef);
      if (existing.exists) {
        const st = (existing.data() as any).status as string | undefined;
        if (st !== "removed" && st !== "left") {
          throw Object.assign(new Error("Player is already in this session"), { code: "ALREADY_EXISTS" });
        }
      }

      const displayName = ((groupPlayer.displayName as string | undefined) ?? "").trim() || "Player";
      const skillLevel = (groupPlayer.skillLevel as string | undefined) ?? "unknown";

      t.set(sessionPlayerRef, {
        playerId: targetPlayerId,
        displayName,
        skillLevel,
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

      t.set(db.doc(`sessions/${sessionId}/leaderboard/${targetPlayerId}`), {
        displayName,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        sitOutCount: 0,
      }, { merge: true });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "player/joined",
        details: { playerId: targetPlayerId, displayName },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok(undefined);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", e.message);
    throw e;
  }
}

const VALID_STATUSES = new Set<SessionPlayerStatus>(["active", "waiting", "left", "removed", "no_show"]);

export async function updatePlayerStatus(
  sessionId: string,
  sessionPlayerId: string,
  status: string,
): Promise<ActionResult<{ rebalanceRecommended: boolean }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId || !sessionPlayerId) return err("INVALID_ARGUMENT", "sessionId and sessionPlayerId are required");
  if (!VALID_STATUSES.has(status as SessionPlayerStatus)) {
    return err("INVALID_ARGUMENT", `Invalid status: ${status}`);
  }

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to update player status"), { code: "FORBIDDEN" });
      }

      const playerRef = db.doc(`sessions/${sessionId}/players/${sessionPlayerId}`);
      const playerSnap = await t.get(playerRef);
      if (!playerSnap.exists) throw Object.assign(new Error("Session player not found"), { code: "NOT_FOUND" });

      const update: Record<string, any> = { status };
      if (status === "left" || status === "removed") {
        update.leftAt = FieldValue.serverTimestamp();
      }
      t.update(playerRef, update);

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "player/updated",
        details: { sessionPlayerId, status },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { rebalanceRecommended: session.status === "active" || session.status === "paused" };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    throw e;
  }
}

export async function addLatePlayer(
  sessionId: string,
  playerId: string,
  displayName: string,
  skillLevel?: string,
): Promise<ActionResult<{ added: true }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId || !playerId || !displayName) {
    return err("INVALID_ARGUMENT", "sessionId, playerId, and displayName are required");
  }
  const resolvedSkill = skillLevel === undefined ? "unknown" : isSkillLevel(skillLevel) ? skillLevel : "unknown";

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      // F-C1: authorize before any precondition check
      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to add players"), { code: "FORBIDDEN" });
      }

      if (session.status !== "active" && session.status !== "paused") {
        throw Object.assign(
          new Error("Session must be active or paused to add a late player"),
          { code: "FAILED_PRECONDITION" },
        );
      }

      const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
      const existing = await t.get(playerRef);
      if (existing.exists) {
        throw Object.assign(new Error("Player is already in this session"), { code: "ALREADY_EXISTS" });
      }

      // No round-gating needed: they simply join the idle pool the next time
      // any court frees up (continuous scheduling, see server/sessions/score.ts).
      t.set(playerRef, {
        playerId,
        displayName,
        skillLevel: resolvedSkill,
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

      t.set(db.doc(`sessions/${sessionId}/leaderboard/${playerId}`), {
        displayName,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        sitOutCount: 0,
      }, { merge: true });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "player/added_late",
        details: { playerId, displayName },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { added: true as const };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "ALREADY_EXISTS") return err("ALREADY_EXISTS", e.message);
    throw e;
  }
}

/**
 * One-tap "Mark Injured / Step Out" action for mid-session player removal.
 *
 * Immediately marks the player as `left` (removing them from all future round
 * scheduling) and writes an injury-specific audit log entry so the organiser
 * has a clear record. Returns rebalanceRecommended: true so the UI can prompt
 * for an immediate rebalance to fill the gap.
 */
export async function markPlayerInjured(
  sessionId: string,
  sessionPlayerId: string,
): Promise<ActionResult<{ rebalanceRecommended: boolean }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (!sessionId || !sessionPlayerId) {
    return err("INVALID_ARGUMENT", "sessionId and sessionPlayerId are required");
  }

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to update player status"), { code: "FORBIDDEN" });
      }

      const playerRef = db.doc(`sessions/${sessionId}/players/${sessionPlayerId}`);
      const playerSnap = await t.get(playerRef);
      if (!playerSnap.exists) throw Object.assign(new Error("Session player not found"), { code: "NOT_FOUND" });
      const player = playerSnap.data()!;

      t.update(playerRef, {
        status: "left",
        leftAt: FieldValue.serverTimestamp(),
        injuredAt: FieldValue.serverTimestamp(),
      });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "player/injured",
        details: {
          sessionPlayerId,
          displayName: player.displayName ?? sessionPlayerId,
          reason: "injury_or_step_out",
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { rebalanceRecommended: session.status === "active" || session.status === "paused" };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    throw e;
  }
}

// ── addGuestPlayerToSession ───────────────────────────────────────────────────

export interface AddSessionGuestInput {
  sessionId: string;
  displayName: string;
  skillLevel?: string;
}

export async function addGuestPlayerToSession(
  input: AddSessionGuestInput,
): Promise<ActionResult<{ playerId: string; rebalanceRecommended: boolean }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const { sessionId, displayName, skillLevel = "unknown" } = input;
  if (!sessionId || !displayName || displayName.trim().length < 1) {
    return err("INVALID_ARGUMENT", "sessionId and displayName are required");
  }

  const db = getAdminDb();

  try {
    const result = await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to add players"), { code: "FORBIDDEN" });
      }

      const guestDocRef = db.collection(`sessions/${sessionId}/players`).doc();
      const playerId = `guest_${guestDocRef.id}`;
      const name = displayName.trim();

      // Write player doc in session
      t.set(db.doc(`sessions/${sessionId}/players/${playerId}`), {
        playerId,
        displayName: name,
        skillLevel,
        status: "active",
        participantType: "guest",
        joinedAt: FieldValue.serverTimestamp(),
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        sitOutCount: 0,
      });

      // Write leaderboard entry
      t.set(db.doc(`sessions/${sessionId}/leaderboard/${playerId}`), {
        displayName: name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        sitOutCount: 0,
      });

      // Write player in group so they show up for squad stats
      t.set(db.doc(`groups/${session.groupId}/players/${playerId}`), {
        userId: null,
        displayName: name,
        email: null,
        skillLevel,
        isGuest: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "player/guest_added",
        details: { playerId, displayName: name },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { playerId, rebalanceRecommended: session.status === "active" || session.status === "paused" };
    });

    return ok(result);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    throw e;
  }
}

/** PRD §12.10: swap two players in a future (scheduled, not locked) match. */
export async function swapPlayers(
  sessionId: string,
  matchId: string,
  outPlayerId: string,
  inPlayerId: string,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  if (outPlayerId === inPlayerId) {
    return err("INVALID_ARGUMENT", "outPlayerId and inPlayerId must differ");
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
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to swap players"), { code: "FORBIDDEN" });
      }

      const matchRef = db.doc(`sessions/${sessionId}/matches/${matchId}`);
      const matchSnap = await t.get(matchRef);
      if (!matchSnap.exists) throw Object.assign(new Error("Match not found"), { code: "NOT_FOUND" });
      const match = matchSnap.data()!;

      if (match.status !== "scheduled" || match.isLocked) {
        throw Object.assign(new Error("Can only swap players in the current, not-yet-started match on a court"), { code: "FAILED_PRECONDITION" });
      }

      const inPlayerRef = db.doc(`sessions/${sessionId}/players/${inPlayerId}`);
      const inPlayerSnap = await t.get(inPlayerRef);
      if (!inPlayerSnap.exists) throw Object.assign(new Error("Replacement player not found"), { code: "NOT_FOUND" });
      const inPlayer = inPlayerSnap.data()!;

      if (!isSchedulable(inPlayer.status)) {
        throw Object.assign(new Error("Replacement player is not available to play"), { code: "FAILED_PRECONDITION" });
      }
      const currentIds: string[] = [
        ...(match.teamAIds || match.teamA.map((p: any) => p.playerId)),
        ...(match.teamBIds || match.teamB.map((p: any) => p.playerId)),
      ];
      if (!currentIds.includes(outPlayerId)) {
        throw Object.assign(new Error("Outgoing player is not in this match"), { code: "FAILED_PRECONDITION" });
      }
      if (currentIds.includes(inPlayerId)) {
        throw Object.assign(new Error("Replacement player is already in this match"), { code: "FAILED_PRECONDITION" });
      }

      const swap = (p: { playerId: string; displayName: string }) =>
        p.playerId === outPlayerId ? { playerId: inPlayerId, displayName: inPlayer.displayName } : p;
      const newTeamA = (match.teamA as Array<{ playerId: string; displayName: string }>).map(swap);
      const newTeamB = (match.teamB as Array<{ playerId: string; displayName: string }>).map(swap);

      t.update(matchRef, {
        teamA: newTeamA,
        teamB: newTeamB,
        teamAIds: newTeamA.map((p) => p.playerId),
        teamBIds: newTeamB.map((p) => p.playerId),
      });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "match/updated",
        details: { matchId, outPlayerId, inPlayerId, action: "swap" },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok(undefined);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    if (e.code === "INVALID_ARGUMENT") return err("INVALID_ARGUMENT", e.message);
    throw e;
  }
}

/** PRD §12.10: reassign the current, not-yet-started match on a court to a different court. */
export async function moveMatch(
  sessionId: string,
  matchId: string,
  courtId: string,
): Promise<ActionResult<void>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to move matches"), { code: "FORBIDDEN" });
      }

      const court = (session.courts || []).find((c: any) => (c.courtId || c.id) === courtId && c.isActive);
      if (!court) {
        throw Object.assign(new Error("Target court not found or inactive"), { code: "FAILED_PRECONDITION" });
      }

      const matchRef = db.doc(`sessions/${sessionId}/matches/${matchId}`);
      const targetOccupiedSnap = await t.get(
        db.collection(`sessions/${sessionId}/matches`).where("status", "==", "scheduled").where("courtId", "==", courtId),
      );
      const matchSnap = await t.get(matchRef);
      if (!matchSnap.exists) throw Object.assign(new Error("Match not found"), { code: "NOT_FOUND" });
      const match = matchSnap.data()!;

      if (match.status !== "scheduled" || match.isLocked) {
        throw Object.assign(new Error("Can only move the current, not-yet-started match on a court"), { code: "FAILED_PRECONDITION" });
      }
      if (!targetOccupiedSnap.empty) {
        throw Object.assign(new Error("Target court already has a scheduled match"), { code: "FAILED_PRECONDITION" });
      }

      t.update(matchRef, { courtId, courtName: court.name });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "match/updated",
        details: { matchId, courtId, action: "move" },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok(undefined);
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }
}

/** DELTA_SPEC D2: disable a court for future scheduling. */
export async function disableCourt(
  sessionId: string,
  courtId: string,
): Promise<ActionResult<{ rebalanceRecommended: boolean }>> {
  const user = await requireSession().catch(() => null);
  if (!user) return err("UNAUTHENTICATED", "Must be signed in");

  const db = getAdminDb();

  try {
    await db.runTransaction(async (t) => {
      const sessionRef = db.doc(`sessions/${sessionId}`);
      const sessionSnap = await t.get(sessionRef);
      if (!sessionSnap.exists) throw Object.assign(new Error("Session not found"), { code: "NOT_FOUND" });
      const session = sessionSnap.data()!;

      const memberSnap = await t.get(db.doc(`groups/${session.groupId}/members/${user.uid}`));
      const role = memberSnap.exists ? (memberSnap.data() as any).role : null;
      if (!canManageSessionPlayers(role)) {
        throw Object.assign(new Error("Must be a squad member to disable courts"), { code: "FORBIDDEN" });
      }

      const courts = (session.courts || []) as Array<any>;
      const courtIdx = courts.findIndex((c: any) => (c.courtId || c.id) === courtId);
      if (courtIdx === -1) throw Object.assign(new Error("Court not found in session"), { code: "NOT_FOUND" });

      const updatedCourts = courts.map((c: any, i: number) => (i === courtIdx ? { ...c, isActive: false } : c));
      t.update(sessionRef, { courts: updatedCourts });

      t.set(db.collection(`sessions/${sessionId}/auditLogs`).doc(), {
        actorUid: user.uid,
        action: "court/disabled",
        details: { courtId },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return ok({ rebalanceRecommended: true });
  } catch (e: any) {
    if (e.code === "NOT_FOUND") return err("NOT_FOUND", e.message);
    if (e.code === "FORBIDDEN") return err("FORBIDDEN", e.message);
    if (e.code === "FAILED_PRECONDITION") return err("FAILED_PRECONDITION", e.message);
    throw e;
  }
}
