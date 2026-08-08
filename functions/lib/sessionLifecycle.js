"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeSession = exports.resumeSession = exports.pauseSession = exports.startSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
const validation_js_1 = require("./lib/validation.js");
const updateSessionStatus = async (request, statusFrom, statusTo, actionLabel, additionalUpdates) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data?.sessionId, "sessionId");
    const db = (0, firestore_1.getFirestore)();
    const isStart = statusTo === "active" && actionLabel === "session_started";
    return db.runTransaction(async (t) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const round1Ref = db.doc(`sessions/${sessionId}/rounds/round_1`);
        // ── ALL READS FIRST ──
        const sessionDoc = await t.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canCreateSession, t);
        // M7: starting requires a generated schedule, else round_1 update throws NOT_FOUND.
        const round1Doc = isStart ? await t.get(round1Ref) : null;
        if (!statusFrom.includes(session.status)) {
            throw new https_1.HttpsError("failed-precondition", `Cannot transition to ${statusTo} from ${session.status}.`);
        }
        if (isStart && !round1Doc.exists) {
            throw new https_1.HttpsError("failed-precondition", "Generate a schedule before starting the session.");
        }
        // ── THEN ALL WRITES ──
        const updates = { status: statusTo, ...additionalUpdates };
        t.update(sessionRef, updates);
        if (isStart) {
            t.update(round1Ref, { status: "in_progress" });
        }
        (0, audit_js_1.writeAudit)(t, sessionId, {
            actorUid: request.auth.uid,
            action: actionLabel,
        });
        return { success: true };
    });
};
exports.startSession = (0, https_1.onCall)({ cors: true }, (request) => updateSessionStatus(request, ["draft", "scheduled"], "active", "session_started", { currentRoundNumber: 1 }));
exports.pauseSession = (0, https_1.onCall)({ cors: true }, (request) => updateSessionStatus(request, ["active"], "paused", "session_paused"));
exports.resumeSession = (0, https_1.onCall)({ cors: true }, (request) => updateSessionStatus(request, ["paused"], "active", "session_resumed"));
exports.completeSession = (0, https_1.onCall)({ cors: true }, (request) => updateSessionStatus(request, ["active", "paused"], "completed", "session_completed"));
