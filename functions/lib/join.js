"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectJoinRequest = exports.approveJoinRequest = exports.requestJoin = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
const rateLimit_js_1 = require("./lib/rateLimit.js");
const validation_js_1 = require("./lib/validation.js");
const MAX_DISPLAY_NAME = 60;
exports.requestJoin = (0, https_1.onCall)({ cors: true }, async (req) => {
    const joinCode = (0, validation_js_1.assertString)(req.data?.joinCode, "joinCode");
    const displayName = (0, validation_js_1.assertString)(req.data?.displayName, "displayName").trim();
    const isGuest = !!req.data?.isGuest;
    // M1: unauthenticated callers write this doc — cap the stored string.
    if (displayName.length > MAX_DISPLAY_NAME) {
        throw new https_1.HttpsError("invalid-argument", `displayName must be ≤ ${MAX_DISPLAY_NAME} characters.`);
    }
    // Rate Limiting by IP roughly. V2 functions expose IP in req.rawRequest.ip or req.rawRequest.socket.remoteAddress
    // Using a fallback for simplicity
    const ip = req.rawRequest?.ip || "unknown-ip";
    await (0, rateLimit_js_1.checkRateLimit)(joinCode, ip);
    const db = (0, firestore_1.getFirestore)();
    const code = (0, domain_1.normalizeJoinCode)(joinCode);
    const q = await db.collection("sessions").where("joinCode", "==", code).where("joinEnabled", "==", true).limit(1).get();
    if (q.empty) {
        throw new https_1.HttpsError("not-found", "Invalid or closed join code");
    }
    const session = q.docs[0];
    const ref = await session.ref.collection("joinRequests").add({
        displayName,
        isGuest: !!isGuest,
        userId: req.auth?.uid ?? null,
        status: "pending",
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { sessionId: session.id, requestId: ref.id };
});
exports.approveJoinRequest = (0, https_1.onCall)({ cors: true }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in");
    const sessionId = (0, validation_js_1.assertString)(req.data?.sessionId, "sessionId");
    const requestId = (0, validation_js_1.assertString)(req.data?.requestId, "requestId");
    const skillLevel = req.data?.skillLevel;
    if (!(0, domain_1.isSkillLevel)(skillLevel))
        throw new https_1.HttpsError("invalid-argument", "Valid skillLevel is required");
    const db = (0, firestore_1.getFirestore)();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const sessionData = sessionSnap.data();
    const requestRef = sessionRef.collection("joinRequests").doc(requestId);
    await db.runTransaction(async (t) => {
        // ── READS (incl. authorization, so it joins the snapshot — F-C1) ──
        const reqSnap = await t.get(requestRef);
        if (!reqSnap.exists)
            throw new https_1.HttpsError("not-found", "Join request not found");
        await (0, auth_js_1.requireGroupRole)(req.auth.uid, sessionData.groupId, domain_1.canManageSessionPlayers, t);
        const reqData = reqSnap.data();
        if (reqData.status !== "pending") {
            throw new https_1.HttpsError("failed-precondition", "Request is not pending");
        }
        const newPlayerId = reqData.userId || requestId; // if guest, use requestId as playerId
        const playerRef = sessionRef.collection("players").doc(newPlayerId);
        const playerSnap = await t.get(playerRef);
        if (playerSnap.exists) {
            throw new https_1.HttpsError("already-exists", "Player is already in the session");
        }
        // ── WRITES ──
        t.set(playerRef, {
            playerId: newPlayerId,
            displayName: reqData.displayName,
            skillLevel: skillLevel,
            status: "registered",
            participantType: reqData.isGuest ? "guest" : "registered_user",
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            sitOutCount: 0,
            addedAt: firestore_1.FieldValue.serverTimestamp()
        });
        t.update(requestRef, { status: "approved" });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: req.auth.uid,
            action: "player/join_approved",
            details: { requestId, playerId: newPlayerId },
        });
    });
    return { success: true };
});
exports.rejectJoinRequest = (0, https_1.onCall)({ cors: true }, async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in");
    const sessionId = (0, validation_js_1.assertString)(req.data?.sessionId, "sessionId");
    const requestId = (0, validation_js_1.assertString)(req.data?.requestId, "requestId");
    const db = (0, firestore_1.getFirestore)();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const groupId = sessionSnap.data().groupId;
    const requestRef = sessionRef.collection("joinRequests").doc(requestId);
    await db.runTransaction(async (t) => {
        const reqSnap = await t.get(requestRef);
        if (!reqSnap.exists)
            throw new https_1.HttpsError("not-found", "Join request not found");
        await (0, auth_js_1.requireGroupRole)(req.auth.uid, groupId, domain_1.canManageSessionPlayers, t);
        if (reqSnap.data().status !== "pending") {
            throw new https_1.HttpsError("failed-precondition", "Request is not pending");
        }
        t.update(requestRef, { status: "rejected" });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: req.auth.uid,
            action: "player/join_rejected",
            details: { requestId },
        });
    });
    return { success: true };
});
