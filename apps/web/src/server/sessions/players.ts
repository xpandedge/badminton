"use server";
import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { canManageSessionPlayers, isSkillLevel, type SessionPlayerStatus } from "@picklebaddies/domain";
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
      const availableFromRound = session.status === "draft" ? 1 : (session.currentRoundNumber || 1) + 1;

      t.set(sessionPlayerRef, {
        playerId: targetPlayerId,
        displayName,
        skillLevel,
        status: "active",
        participantType: "registered_user",
        joinedAt: FieldValue.serverTimestamp(),
        availableFromRound,
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
): Promise<ActionResult<{ availableFromRound: number; rebalanceRecommended: boolean }>> {
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

      const currentRound = session.currentRoundNumber || 1;
      const availableFromRound = currentRound + 1;

      t.set(playerRef, {
        playerId,
        displayName,
        skillLevel: resolvedSkill,
        status: "active",
        participantType: "registered_user",
        joinedAt: FieldValue.serverTimestamp(),
        availableFromRound,
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
        details: { playerId, displayName, availableFromRound },
        createdAt: FieldValue.serverTimestamp(),
      });

      return { availableFromRound, rebalanceRecommended: true };
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
