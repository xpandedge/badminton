"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitScore = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const domain_2 = require("@picklebaddies/domain");
const auth_js_1 = require("./lib/auth.js");
const audit_js_1 = require("./lib/audit.js");
const validation_js_1 = require("./lib/validation.js");
exports.submitScore = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be logged in.");
    const sessionId = (0, validation_js_1.assertString)(request.data.sessionId, "sessionId");
    const roundNumber = (0, validation_js_1.assertInt)(request.data.roundNumber, "roundNumber");
    const matchId = (0, validation_js_1.assertString)(request.data.matchId, "matchId");
    // payload validation deferred until scoringMode is known (below)
    const rawPayload = request.data.payload;
    const db = (0, firestore_1.getFirestore)();
    return db.runTransaction(async (transaction) => {
        const sessionRef = db.doc(`sessions/${sessionId}`);
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists)
            throw new https_1.HttpsError("not-found", "Session not found.");
        const session = sessionDoc.data();
        await (0, auth_js_1.requireGroupRole)(request.auth.uid, session.groupId, domain_1.canEnterScore, transaction);
        // F-H5: scores only belong to a live session and a match that is currently
        // playable. Scoring a future (scheduled) match would lock it and corrupt the
        // next rebalance, so reject anything outside the current round / not in play.
        if (session.status !== "active" && session.status !== "paused") {
            throw new https_1.HttpsError("failed-precondition", "Scores can only be entered while the session is active.");
        }
        if (roundNumber > (session.currentRoundNumber || 0)) {
            throw new https_1.HttpsError("failed-precondition", "Cannot score a future round.");
        }
        const matchRef = db.doc(`sessions/${sessionId}/rounds/round_${roundNumber}/matches/${matchId}`);
        const matchDoc = await transaction.get(matchRef);
        if (!matchDoc.exists)
            throw new https_1.HttpsError("not-found", "Match not found.");
        const match = matchDoc.data();
        if (match.status === "cancelled") {
            throw new https_1.HttpsError("failed-precondition", "Cannot submit score for a cancelled match.");
        }
        const payload = (0, validation_js_1.assertScorePayload)(rawPayload, session.scoringMode);
        const winnerTeam = (0, domain_2.deriveWinner)(payload, session.scoringMode);
        const teamAIds = match.teamAIds || match.teamA.map((p) => p.playerId);
        const teamBIds = match.teamBIds || match.teamB.map((p) => p.playerId);
        const allPlayerIds = [...teamAIds, ...teamBIds];
        const playerStatsRefs = allPlayerIds.map(id => db.doc(`sessions/${sessionId}/players/${id}`));
        const playerStatsDocs = await Promise.all(playerStatsRefs.map(ref => transaction.get(ref)));
        const leaderboardRefs = allPlayerIds.map(id => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
        const leaderboardDocs = await Promise.all(leaderboardRefs.map(ref => transaction.get(ref)));
        const isEdit = match.status === "completed";
        const priorWinnerTeam = match.winnerTeam;
        const priorPayload = match.scorePayload;
        // We need to reverse prior stats if it's an edit
        const updateStats = (docData, playerId, reverse = false) => {
            const stats = docData || { gamesPlayed: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0 };
            const isTeamA = teamAIds.includes(playerId);
            const isWinner = reverse ? (priorWinnerTeam === (isTeamA ? "A" : "B")) : (winnerTeam === (isTeamA ? "A" : "B"));
            const src = reverse ? priorPayload : payload;
            // F-C2: use typeof checks, never truthiness — a legitimate score of 0 must
            // not be silently dropped from points stats.
            const rawFor = isTeamA ? src?.teamAScore : src?.teamBScore;
            const rawAgainst = isTeamA ? src?.teamBScore : src?.teamAScore;
            const pFor = typeof rawFor === "number" ? rawFor : undefined;
            const pAgainst = typeof rawAgainst === "number" ? rawAgainst : undefined;
            const sign = reverse ? -1 : 1;
            const hasPoints = pFor !== undefined && pAgainst !== undefined;
            return {
                ...stats,
                gamesPlayed: (stats.gamesPlayed || 0) + sign * 1,
                wins: (stats.wins || 0) + (isWinner ? sign * 1 : 0),
                losses: (stats.losses || 0) + (!isWinner ? sign * 1 : 0),
                pointsFor: (stats.pointsFor || 0) + (pFor !== undefined ? sign * pFor : 0),
                pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== undefined ? sign * pAgainst : 0),
                pointDifference: (stats.pointDifference || 0) + (hasPoints ? sign * (pFor - pAgainst) : 0),
            };
        };
        const newStatsMap = new Map();
        const newLbMap = new Map();
        for (let i = 0; i < allPlayerIds.length; i++) {
            const pid = allPlayerIds[i];
            let pStats = playerStatsDocs[i]?.data() || {};
            let lbStats = leaderboardDocs[i]?.data() || {};
            if (isEdit) {
                pStats = updateStats(pStats, pid, true);
                lbStats = updateStats(lbStats, pid, true);
            }
            pStats = updateStats(pStats, pid, false);
            lbStats = updateStats(lbStats, pid, false);
            newStatsMap.set(pid, pStats);
            newLbMap.set(pid, lbStats);
        }
        // Apply updates
        transaction.update(matchRef, {
            scorePayload: payload,
            winnerTeam,
            status: "completed",
            isLocked: true,
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        for (let i = 0; i < allPlayerIds.length; i++) {
            const pid = allPlayerIds[i];
            transaction.set(playerStatsRefs[i], newStatsMap.get(pid), { merge: true });
            transaction.set(leaderboardRefs[i], newLbMap.get(pid), { merge: true });
        }
        (0, audit_js_1.writeAudit)(transaction, sessionId, {
            actorUid: request.auth.uid,
            action: isEdit ? "score_changed" : "score",
            details: { matchId, roundNumber, payload, winnerTeam }
        });
        return { success: true };
    });
});
