import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { canManageSessionPlayers, type SessionPlayerStatus, SKILL_LEVELS, isSkillLevel } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { assertString, assertEnum } from "./lib/validation.js";

const VALID_STATUSES: ReadonlySet<SessionPlayerStatus> = new Set([
  "active", "waiting", "left", "removed", "no_show",
]);

export const updatePlayerStatus = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const sessionPlayerId = assertString(request.data.sessionPlayerId, "sessionPlayerId");
  const status = assertEnum(request.data.status, "status", [...VALID_STATUSES] as SessionPlayerStatus[]);

  const db = getFirestore();

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canManageSessionPlayers, t);

    const playerRef = db.doc(`sessions/${sessionId}/players/${sessionPlayerId}`);
    const playerDoc = await t.get(playerRef);
    if (!playerDoc.exists) throw new HttpsError("not-found", "Session player not found.");

    const update: Record<string, any> = { status };
    if (status === "left" || status === "removed") {
      update.leftAt = FieldValue.serverTimestamp();
    }

    t.update(playerRef, update);

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: "player/updated",
      details: { sessionPlayerId, status },
    });

    const rebalanceRecommended = session.status === "active" || session.status === "paused";
    return { success: true, rebalanceRecommended };
  });
});

export const addLatePlayer = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const playerId = assertString(request.data.playerId, "playerId");
  const displayName = assertString(request.data.displayName, "displayName");
  const skillLevel = request.data.skillLevel === undefined
    ? "unknown"
    : (isSkillLevel(request.data.skillLevel)
        ? request.data.skillLevel
        : assertEnum(request.data.skillLevel, "skillLevel", SKILL_LEVELS));

  const db = getFirestore();

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    // F-C1: authorize before any other precondition or mutation.
    await requireGroupRole(request.auth!.uid, session.groupId, canManageSessionPlayers, t);

    if (session.status !== "active" && session.status !== "paused") {
      throw new HttpsError("failed-precondition", "Session must be active or paused to add a late player.");
    }

    // M2: don't silently overwrite an existing session player (their stats/name).
    const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
    const existing = await t.get(playerRef);
    if (existing.exists) {
      throw new HttpsError("already-exists", "Player is already in this session.");
    }

    const currentRound = session.currentRoundNumber || 1;
    const availableFromRound = currentRound + 1;

    t.set(playerRef, {
      playerId,
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

    // Initialize leaderboard entry
    const lbRef = db.doc(`sessions/${sessionId}/leaderboard/${playerId}`);
    t.set(lbRef, {
      gamesPlayed: 0, wins: 0, losses: 0,
      pointsFor: 0, pointsAgainst: 0, pointDifference: 0, sitOutCount: 0,
    }, { merge: true });

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: "player/added_late",
      details: { playerId, displayName, availableFromRound },
    });

    return { success: true, availableFromRound, rebalanceRecommended: true };
  });
});
