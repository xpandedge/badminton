import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { canManageSessionPlayers, isSchedulable } from "@picklebaddies/domain";
import { requireGroupRole } from "./lib/auth.js";
import { writeAudit } from "./lib/audit.js";
import { assertString, assertInt } from "./lib/validation.js";

/** PRD §12.10: swap two players in a future (scheduled, not locked) match. */
export const swapPlayers = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const matchId = assertString(request.data.matchId, "matchId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const outPlayerId = assertString(request.data.outPlayerId, "outPlayerId");
  const inPlayerId = assertString(request.data.inPlayerId, "inPlayerId");

  if (outPlayerId === inPlayerId) {
    throw new HttpsError("invalid-argument", "outPlayerId and inPlayerId must differ.");
  }

  const db = getFirestore();

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canManageSessionPlayers, t);

    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await t.get(matchRef);
    if (!matchDoc.exists) throw new HttpsError("not-found", "Match not found.");
    const match = matchDoc.data()!;

    if (match.status !== "scheduled" || match.isLocked) {
      throw new HttpsError("failed-precondition", "Can only swap players in future scheduled matches.");
    }

    // Load the in-player's data for display name / skill update
    const inPlayerRef = db.doc(`sessions/${sessionId}/players/${inPlayerId}`);
    const inPlayerDoc = await t.get(inPlayerRef);
    if (!inPlayerDoc.exists) throw new HttpsError("not-found", "Replacement player not found.");
    const inPlayer = inPlayerDoc.data()!;

    // L4: the replacement must be schedulable, the outgoing must be in the match,
    // and the replacement must not already be playing in it.
    if (!isSchedulable(inPlayer.status)) {
      throw new HttpsError("failed-precondition", "Replacement player is not available to play.");
    }
    const currentIds: string[] = [
      ...(match.teamAIds || match.teamA.map((p: any) => p.playerId)),
      ...(match.teamBIds || match.teamB.map((p: any) => p.playerId)),
    ];
    if (!currentIds.includes(outPlayerId)) {
      throw new HttpsError("failed-precondition", "Outgoing player is not in this match.");
    }
    if (currentIds.includes(inPlayerId)) {
      throw new HttpsError("failed-precondition", "Replacement player is already in this match.");
    }

    // Swap in teamA
    const newTeamA = (match.teamA as Array<{ playerId: string; displayName: string }>).map((p) =>
      p.playerId === outPlayerId
        ? { playerId: inPlayerId, displayName: inPlayer.displayName }
        : p
    );
    const newTeamB = (match.teamB as Array<{ playerId: string; displayName: string }>).map((p) =>
      p.playerId === outPlayerId
        ? { playerId: inPlayerId, displayName: inPlayer.displayName }
        : p
    );

    const newTeamAIds = newTeamA.map((p) => p.playerId);
    const newTeamBIds = newTeamB.map((p) => p.playerId);

    t.update(matchRef, {
      teamA: newTeamA,
      teamB: newTeamB,
      teamAIds: newTeamAIds,
      teamBIds: newTeamBIds,
    });

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: "match/updated",
      details: { matchId, roundNumber, outPlayerId, inPlayerId, action: "swap" },
    });

    return { success: true };
  });
});

/** PRD §12.10: reassign a future match to a different court. */
export const moveMatch = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const matchId = assertString(request.data.matchId, "matchId");
  const roundNumber = assertInt(request.data.roundNumber, "roundNumber");
  const courtId = assertString(request.data.courtId, "courtId");

  const db = getFirestore();

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canManageSessionPlayers, t);

    // Validate target court exists and is active (DELTA_SPEC D2)
    const court = (session.courts || []).find(
      (c: any) => (c.courtId || c.id) === courtId && c.isActive
    );
    if (!court) {
      throw new HttpsError("failed-precondition", "Target court not found or inactive.");
    }

    const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
    const matchDoc = await t.get(matchRef);
    if (!matchDoc.exists) throw new HttpsError("not-found", "Match not found.");
    const match = matchDoc.data()!;

    if (match.status !== "scheduled" || match.isLocked) {
      throw new HttpsError("failed-precondition", "Can only move future scheduled matches.");
    }

    t.update(matchRef, { courtId, courtName: court.name });

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: "match/updated",
      details: { matchId, roundNumber, courtId, action: "move" },
    });

    return { success: true };
  });
});

/** DELTA_SPEC D2: disable a court for future scheduling. */
export const disableCourt = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const sessionId = assertString(request.data.sessionId, "sessionId");
  const courtId = assertString(request.data.courtId, "courtId");

  const db = getFirestore();

  return db.runTransaction(async (t) => {
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessionDoc = await t.get(sessionRef);
    if (!sessionDoc.exists) throw new HttpsError("not-found", "Session not found.");
    const session = sessionDoc.data()!;

    await requireGroupRole(request.auth!.uid, session.groupId, canManageSessionPlayers, t);

    const courts = (session.courts || []) as Array<any>;
    const courtIdx = courts.findIndex((c: any) => (c.courtId || c.id) === courtId);
    if (courtIdx === -1) {
      throw new HttpsError("not-found", "Court not found in session.");
    }

    const updatedCourts = courts.map((c: any, i: number) =>
      i === courtIdx ? { ...c, isActive: false } : c
    );

    t.update(sessionRef, { courts: updatedCourts });

    writeAudit(t, sessionId, {
      actorUid: request.auth!.uid,
      action: "court/disabled",
      details: { courtId },
    });

    return { success: true, rebalanceRecommended: true };
  });
});
