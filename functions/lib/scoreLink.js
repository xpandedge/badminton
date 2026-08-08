"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitScoreByLink = exports.getScoreLinkData = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const domain_1 = require("@picklebaddies/domain");
const validation_js_1 = require("./lib/validation.js");
const rateLimit_js_1 = require("./lib/rateLimit.js");
const audit_js_1 = require("./lib/audit.js");
exports.getScoreLinkData = (0, https_1.onCall)({ cors: true, invoker: "public" }, async (request) => {
    const rawCode = (0, validation_js_1.assertString)(request.data?.scoreCode, "scoreCode");
    const scoreCode = (0, domain_1.normalizeJoinCode)(rawCode);
    const db = (0, firestore_1.getFirestore)();
    const q = await db.collection("sessions")
        .where("scoreCode", "==", scoreCode)
        .where("scoreLinkEnabled", "==", true)
        .limit(1)
        .get();
    if (q.empty)
        throw new https_1.HttpsError("not-found", "Invalid or disabled score link.");
    const sessionDoc = q.docs[0];
    const session = sessionDoc.data();
    const sessionId = sessionDoc.id;
    if (session.status !== "active") {
        return {
            sessionId,
            sessionName: session.name,
            sport: session.sport,
            scoringMode: session.scoringMode,
            currentRoundNumber: session.currentRoundNumber || 0,
            sessionStatus: session.status,
            courts: [],
        };
    }
    const activeCourts = session.courts
        .filter((c) => c.isActive !== false);
    const matchSnaps = await Promise.all(activeCourts.map((court) => db.collection(`sessions/${sessionId}/rounds/round_${session.currentRoundNumber}/matches`)
        .where("courtId", "==", court.courtId)
        .limit(1)
        .get()));
    const courts = activeCourts.map((court, i) => {
        const matchDoc = matchSnaps[i].docs[0];
        if (!matchDoc || matchDoc.data().status === "cancelled") {
            return { courtId: court.courtId, courtName: court.name, match: null };
        }
        const m = matchDoc.data();
        return {
            courtId: court.courtId,
            courtName: court.name,
            match: {
                matchId: matchDoc.id,
                teamA: m.teamA.map((p) => ({
                    playerId: p.playerId,
                    displayName: p.displayName,
                })),
                teamB: m.teamB.map((p) => ({
                    playerId: p.playerId,
                    displayName: p.displayName,
                })),
                status: m.status,
            },
        };
    });
    return {
        sessionId,
        sessionName: session.name,
        sport: session.sport,
        scoringMode: session.scoringMode,
        currentRoundNumber: session.currentRoundNumber,
        sessionStatus: session.status,
        courts,
    };
});
exports.submitScoreByLink = (0, https_1.onCall)({ cors: true, invoker: "public" }, async (request) => {
    const rawCode = (0, validation_js_1.assertString)(request.data?.scoreCode, "scoreCode");
    const courtId = (0, validation_js_1.assertString)(request.data?.courtId, "courtId");
    const rawPayload = request.data?.payload;
    const ip = request.rawRequest?.ip || "unknown";
    const scoreCode = (0, domain_1.normalizeJoinCode)(rawCode);
    await (0, rateLimit_js_1.checkRateLimit)(scoreCode, ip);
    const db = (0, firestore_1.getFirestore)();
    const q = await db.collection("sessions")
        .where("scoreCode", "==", scoreCode)
        .where("scoreLinkEnabled", "==", true)
        .limit(1)
        .get();
    if (q.empty)
        throw new https_1.HttpsError("not-found", "Invalid or disabled score link.");
    const sessionDoc = q.docs[0];
    const sessionId = sessionDoc.id;
    const session = sessionDoc.data();
    if (session.status !== "active") {
        throw new https_1.HttpsError("failed-precondition", "Session is not active.");
    }
    const roundNumber = session.currentRoundNumber || 0;
    if (roundNumber === 0)
        throw new https_1.HttpsError("failed-precondition", "No active round.");
    return db.runTransaction(async (transaction) => {
        const matchQuery = await transaction.get(db
            .collection(`sessions/${sessionId}/rounds/round_${roundNumber}/matches`)
            .where("courtId", "==", courtId)
            .limit(1));
        if (matchQuery.empty) {
            throw new https_1.HttpsError("not-found", "No match found on that court.");
        }
        const matchDoc = matchQuery.docs[0];
        const match = matchDoc.data();
        const matchRef = matchDoc.ref;
        if (match.status === "completed") {
            throw new https_1.HttpsError("failed-precondition", "Match already scored.");
        }
        if (match.status === "cancelled") {
            throw new https_1.HttpsError("failed-precondition", "Match is cancelled.");
        }
        const payload = (0, validation_js_1.assertScorePayload)(rawPayload, session.scoringMode);
        const winnerTeam = (0, domain_1.deriveWinner)(payload, session.scoringMode);
        const teamAIds = match.teamAIds || match.teamA.map((p) => p.playerId);
        const teamBIds = match.teamBIds || match.teamB.map((p) => p.playerId);
        const allPlayerIds = [...teamAIds, ...teamBIds];
        const playerStatsRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/players/${id}`));
        const leaderboardRefs = allPlayerIds.map((id) => db.doc(`sessions/${sessionId}/leaderboard/${id}`));
        const [playerStatsDocs, leaderboardDocs] = await Promise.all([
            Promise.all(playerStatsRefs.map((ref) => transaction.get(ref))),
            Promise.all(leaderboardRefs.map((ref) => transaction.get(ref))),
        ]);
        const updateStats = (docData, playerId) => {
            const stats = docData || {
                gamesPlayed: 0, wins: 0, losses: 0,
                pointsFor: 0, pointsAgainst: 0, pointDifference: 0,
            };
            const isTeamA = teamAIds.includes(playerId);
            const isWinner = winnerTeam === (isTeamA ? "A" : "B");
            const rawFor = isTeamA ? payload.teamAScore : payload.teamBScore;
            const rawAgainst = isTeamA ? payload.teamBScore : payload.teamAScore;
            const pFor = typeof rawFor === "number" ? rawFor : undefined;
            const pAgainst = typeof rawAgainst === "number" ? rawAgainst : undefined;
            const hasPoints = pFor !== undefined && pAgainst !== undefined;
            return {
                ...stats,
                gamesPlayed: (stats.gamesPlayed || 0) + 1,
                wins: (stats.wins || 0) + (isWinner ? 1 : 0),
                losses: (stats.losses || 0) + (!isWinner ? 1 : 0),
                pointsFor: (stats.pointsFor || 0) + (pFor !== undefined ? pFor : 0),
                pointsAgainst: (stats.pointsAgainst || 0) + (pAgainst !== undefined ? pAgainst : 0),
                pointDifference: (stats.pointDifference || 0) + (hasPoints ? pFor - pAgainst : 0),
            };
        };
        transaction.update(matchRef, {
            scorePayload: payload,
            winnerTeam,
            status: "completed",
            isLocked: true,
            completedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        for (let i = 0; i < allPlayerIds.length; i++) {
            const pid = allPlayerIds[i];
            transaction.set(playerStatsRefs[i], updateStats(playerStatsDocs[i]?.data(), pid), { merge: true });
            transaction.set(leaderboardRefs[i], updateStats(leaderboardDocs[i]?.data(), pid), { merge: true });
        }
        (0, audit_js_1.writeAudit)(transaction, sessionId, {
            actorUid: "court_link",
            action: "score",
            details: { matchId: matchDoc.id, roundNumber, courtId, payload, winnerTeam, source: "court_link", ip },
        });
        const courtName = session.courts
            .find((c) => c.courtId === courtId)?.name ?? courtId;
        return { success: true, courtName, winnerTeam };
    });
});
