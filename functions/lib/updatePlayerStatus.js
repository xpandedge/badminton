"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLatePlayer = exports.updatePlayerStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
const validation_js_1 = require("./lib/validation.js");
const VALID_STATUSES = new Set([
    "active", "waiting", "left", "removed", "no_show",
]);
exports.updatePlayerStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const sessionPlayerId = (0, validation_js_1.assertString)(request.data.sessionPlayerId, "sessionPlayerId");
    const status = (0, validation_js_1.assertEnum)(request.data.status, "status", [...VALID_STATUSES]);
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canManageSessionPlayers, t);
        const playerRef = db.doc(`sessions/${sessionId}/players/${sessionPlayerId}`);
        const playerDoc = await t.get(playerRef);
        if (!playerDoc.exists)
            throw new https_1.HttpsError("not-found", "Session player not found.");
        const update = { status };
        if (status === "left" || status === "removed") {
            update.leftAt = firestore_1.FieldValue.serverTimestamp();
        }
        t.update(playerRef, update);
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "player/updated",
            details: { sessionPlayerId, status },
        });
        const rebalanceRecommended = session.status === "active" || session.status === "paused";
        return { success: true, rebalanceRecommended };
    });
});
exports.addLatePlayer = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const playerId = (0, validation_js_1.assertString)(request.data.playerId, "playerId");
    const displayName = (0, validation_js_1.assertString)(request.data.displayName, "displayName");
    const skillLevel = request.data.skillLevel === undefined
        ? "unknown"
        : ((0, domain_1.isSkillLevel)(request.data.skillLevel)
            ? request.data.skillLevel
            : (0, validation_js_1.assertEnum)(request.data.skillLevel, "skillLevel", domain_1.SKILL_LEVELS));
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        // F-C1: authorize before any other precondition or mutation.
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canManageSessionPlayers, t);
        if (session.status !== "active" && session.status !== "paused") {
            throw new https_1.HttpsError("failed-precondition", "Session must be active or paused to add a late player.");
        }
        // M2: don't silently overwrite an existing session player (their stats/name).
        const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
        const existing = await t.get(playerRef);
        if (existing.exists) {
            throw new https_1.HttpsError("already-exists", "Player is already in this session.");
        }
        const currentRound = session.currentRoundNumber || 1;
        const availableFromRound = currentRound + 1;
        t.set(playerRef, {
            playerId,
            displayName,
            skillLevel,
            status: "active",
            participantType: "registered_user",
            joinedAt: firestore_1.FieldValue.serverTimestamp(),
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
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "player/added_late",
            details: { playerId, displayName, availableFromRound },
        });
        return { success: true, availableFromRound, rebalanceRecommended: true };
    });
});
