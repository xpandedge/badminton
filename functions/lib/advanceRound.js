"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceRound = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
exports.advanceRound = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const { sessionId, force } = request.data;
    if (!sessionId)
        throw new https_1.HttpsError("invalid-argument", "sessionId is required.");
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canAdvanceRound, t);
        if (session.status !== "active") {
            throw new https_1.HttpsError("failed-precondition", "Session must be active to advance round.");
        }
        const currentRound = session.currentRoundNumber || 1;
        const currentRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${currentRound}`);
        const nextRound = currentRound + 1;
        const nextRoundRef = db.doc(`sessions/${sessionId}/rounds/round_${nextRound}`);
        // ── ALL READS FIRST (Firestore: reads must precede writes in a transaction) ──
        // M6: read current-round matches transactionally so the cancel-pending writes
        // are conflict-checked against any concurrent score submission.
        const matchesQuery = db.collection(`sessions/${sessionId}/rounds/round_${currentRound}/matches`);
        const matchesSnap = await t.get(matchesQuery);
        const nextRoundDoc = await t.get(nextRoundRef);
        const pendingMatches = matchesSnap.docs.filter((d) => {
            const data = d.data();
            return data.status === "scheduled" || data.status === "in_progress";
        });
        if (pendingMatches.length > 0 && !force) {
            return { needsConfirmation: true, pendingCount: pendingMatches.length };
        }
        // ── THEN ALL WRITES ──
        // Cancel pending matches if forced
        for (const matchDoc of pendingMatches) {
            t.update(matchDoc.ref, { status: "cancelled", isLocked: true });
        }
        // Complete current round
        t.update(currentRoundRef, { status: "completed" });
        // Move to next round
        if (nextRoundDoc.exists) {
            t.update(nextRoundRef, { status: "in_progress" });
        }
        t.update(sessionRef, { currentRoundNumber: nextRound });
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: "round_advanced",
            details: { fromRound: currentRound, toRound: nextRound, forced: !!force }
        });
        return { success: true, nextRound };
    });
});
