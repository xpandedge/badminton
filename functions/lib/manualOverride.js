"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disableCourt = exports.moveMatch = exports.swapPlayers = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
const validation_js_1 = require("./lib/validation.js");
/** PRD §12.10: swap two players in a future (scheduled, not locked) match. */
exports.swapPlayers = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const matchId = (0, validation_js_1.assertString)(request.data.matchId, "matchId");
    const roundNumber = (0, validation_js_1.assertInt)(request.data.roundNumber, "roundNumber");
    const outPlayerId = (0, validation_js_1.assertString)(request.data.outPlayerId, "outPlayerId");
    const inPlayerId = (0, validation_js_1.assertString)(request.data.inPlayerId, "inPlayerId");
    if (outPlayerId === inPlayerId) {
        throw new https_1.HttpsError("invalid-argument", "outPlayerId and inPlayerId must differ.");
    }
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canManageSessionPlayers, t);
        const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
        const matchDoc = await t.get(matchRef);
        if (!matchDoc.exists)
            throw new https_1.HttpsError("not-found", "Match not found.");
        const match = matchDoc.data();
        if (match.status !== "scheduled" || match.isLocked) {
            throw new https_1.HttpsError("failed-precondition", "Can only swap players in future scheduled matches.");
        }
        // Load the in-player's data for display name / skill update
        const inPlayerRef = db.doc(`sessions/${sessionId}/players/${inPlayerId}`);
        const inPlayerDoc = await t.get(inPlayerRef);
        if (!inPlayerDoc.exists)
            throw new https_1.HttpsError("not-found", "Replacement player not found.");
        const inPlayer = inPlayerDoc.data();
        // L4: the replacement must be schedulable, the outgoing must be in the match,
        // and the replacement must not already be playing in it.
        if (!(0, domain_1.isSchedulable)(inPlayer.status)) {
            throw new https_1.HttpsError("failed-precondition", "Replacement player is not available to play.");
        }
        const currentIds = [
            ...(match.teamAIds || match.teamA.map((p) => p.playerId)),
            ...(match.teamBIds || match.teamB.map((p) => p.playerId)),
        ];
        if (!currentIds.includes(outPlayerId)) {
            throw new https_1.HttpsError("failed-precondition", "Outgoing player is not in this match.");
        }
        if (currentIds.includes(inPlayerId)) {
            throw new https_1.HttpsError("failed-precondition", "Replacement player is already in this match.");
        }
        // Swap in teamA
        const newTeamA = match.teamA.map((p) => p.playerId === outPlayerId
            ? { playerId: inPlayerId, displayName: inPlayer.displayName }
            : p);
        const newTeamB = match.teamB.map((p) => p.playerId === outPlayerId
            ? { playerId: inPlayerId, displayName: inPlayer.displayName }
            : p);
        const newTeamAIds = newTeamA.map((p) => p.playerId);
        const newTeamBIds = newTeamB.map((p) => p.playerId);
        t.update(matchRef, {
            teamA: newTeamA,
            teamB: newTeamB,
            teamAIds: newTeamAIds,
            teamBIds: newTeamBIds,
        });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "match/updated",
            details: { matchId, roundNumber, outPlayerId, inPlayerId, action: "swap" },
        });
        return { success: true };
    });
});
/** PRD §12.10: reassign a future match to a different court. */
exports.moveMatch = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const matchId = (0, validation_js_1.assertString)(request.data.matchId, "matchId");
    const roundNumber = (0, validation_js_1.assertInt)(request.data.roundNumber, "roundNumber");
    const courtId = (0, validation_js_1.assertString)(request.data.courtId, "courtId");
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canManageSessionPlayers, t);
        // Validate target court exists and is active (DELTA_SPEC D2)
        const court = (session.courts || []).find((c) => (c.courtId || c.id) === courtId && c.isActive);
        if (!court) {
            throw new https_1.HttpsError("failed-precondition", "Target court not found or inactive.");
        }
        const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
        const matchDoc = await t.get(matchRef);
        if (!matchDoc.exists)
            throw new https_1.HttpsError("not-found", "Match not found.");
        const match = matchDoc.data();
        if (match.status !== "scheduled" || match.isLocked) {
            throw new https_1.HttpsError("failed-precondition", "Can only move future scheduled matches.");
        }
        t.update(matchRef, { courtId, courtName: court.name });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "match/updated",
            details: { matchId, roundNumber, courtId, action: "move" },
        });
        return { success: true };
    });
});
/** DELTA_SPEC D2: disable a court for future scheduling. */
exports.disableCourt = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const courtId = (0, validation_js_1.assertString)(request.data.courtId, "courtId");
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canManageSessionPlayers, t);
        const courts = (session.courts || []);
        const courtIdx = courts.findIndex((c) => (c.courtId || c.id) === courtId);
        if (courtIdx === -1) {
            throw new https_1.HttpsError("not-found", "Court not found in session.");
        }
        const updatedCourts = courts.map((c, i) => i === courtIdx ? { ...c, isActive: false } : c);
        t.update(sessionRef, { courts: updatedCourts });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "court/disabled",
            details: { courtId },
        });
        return { success: true, rebalanceRecommended: true };
    });
});
