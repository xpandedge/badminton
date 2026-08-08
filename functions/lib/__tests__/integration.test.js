"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Emulator integration tests (PRD §26.2).
 *
 * Run with: pnpm --filter @picklebaddies/functions test:int
 * Requires: firebase emulators running (firestore, auth, functions).
 *
 * Test setup: Admin SDK writes directly to emulated Firestore.
 * Callable invocations use the Functions emulator HTTP endpoint with an
 * auth token obtained from the Auth emulator.
 */
const vitest_1 = require("vitest");
const admin = __importStar(require("firebase-admin"));
const PROJECT_ID = "picklebaddies-85732";
const REGION = "us-central1";
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;
const AUTH_EMULATOR_BASE = `http://127.0.0.1:9099`;
// ── Admin SDK initialisation ─────────────────────────────────────────────────
let db;
(0, vitest_1.beforeAll)(() => {
    if (!admin.apps.length) {
        admin.initializeApp({ projectId: PROJECT_ID });
    }
    db = admin.firestore();
    db.settings({ host: "127.0.0.1:8080", ssl: false });
});
(0, vitest_1.afterAll)(async () => {
    // Clear all data between test runs
    const sessions = await db.collection("sessions").listDocuments();
    const groups = await db.collection("groups").listDocuments();
    await Promise.all([...sessions, ...groups].map((d) => d.delete()));
});
// ── Auth helper ──────────────────────────────────────────────────────────────
async function getIdToken(uid) {
    const customToken = await admin.auth().createCustomToken(uid);
    const res = await fetch(`${AUTH_EMULATOR_BASE}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    });
    const json = (await res.json());
    if (!json.idToken)
        throw new Error(`Auth failed: ${JSON.stringify(json)}`);
    return json.idToken;
}
async function callFunction(name, data, idToken) {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ data }),
    });
    const json = (await res.json());
    if (json.error)
        throw new Error(JSON.stringify(json.error));
    return json.result;
}
async function callUnauthenticatedFunction(name, data) {
    const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
    });
    const json = (await res.json());
    if (json.error)
        throw new Error(JSON.stringify(json.error));
    return json.result;
}
// ── Test data setup helpers ──────────────────────────────────────────────────
async function createBaseFixture() {
    const groupId = "g-int-test";
    const sessionId = "s-int-test";
    const ownerId = "owner-int";
    await db.doc(`groups/${groupId}`).set({ createdBy: ownerId, name: "Test Group" });
    await db.doc(`groups/${groupId}/members/${ownerId}`).set({ role: "owner" });
    await db.doc(`groups/${groupId}/venues/v1`).set({ name: "Hall" });
    await db.doc(`groups/${groupId}/venues/v1/courts/c1`).set({ name: "Court 1", courtNumber: 1, isActive: true });
    await db.doc(`groups/${groupId}/venues/v1/courts/c2`).set({ name: "Court 2", courtNumber: 2, isActive: true });
    await db.doc(`sessions/${sessionId}`).set({
        groupId,
        venueId: "v1",
        name: "Integration Test Session",
        sport: "badminton",
        status: "draft",
        durationMinutes: 60,
        estimatedGameMinutes: 15,
        scoringMode: "winner_only",
        currentRoundNumber: 0,
        joinCode: "INTTEST",
        joinEnabled: true,
        courts: [
            { courtId: "c1", name: "Court 1", courtNumber: 1, isActive: true },
            { courtId: "c2", name: "Court 2", courtNumber: 2, isActive: true },
        ],
        courtCount: 2,
        createdBy: ownerId,
    });
    // Add 8 players (enough for 2 courts)
    const playerIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    for (const pid of playerIds) {
        await db.doc(`sessions/${sessionId}/players/${pid}`).set({
            playerId: pid,
            displayName: `Player ${pid}`,
            skillLevel: "intermediate",
            status: "active",
            participantType: "registered_user",
            gamesPlayed: 0, wins: 0, losses: 0,
            pointsFor: 0, pointsAgainst: 0, sitOutCount: 0,
        });
    }
    return { groupId, sessionId, ownerId, playerIds };
}
// ── Tests ────────────────────────────────────────────────────────────────────
(0, vitest_1.describe)("PRD §26.2 Integration flows", () => {
    let fixture;
    let ownerToken;
    (0, vitest_1.beforeEach)(async () => {
        // Clear and recreate fixture for each test
        try {
            const snap = await db.collection("sessions").get();
            for (const d of snap.docs)
                await d.ref.delete();
        }
        catch { /* ignore */ }
        fixture = await createBaseFixture();
        ownerToken = await getIdToken(fixture.ownerId);
    });
    (0, vitest_1.it)("flow 1: generate schedule → rounds and matches are created", async () => {
        await callFunction("generateSchedule", { sessionId: fixture.sessionId }, ownerToken);
        const roundsSnap = await db.collection(`sessions/${fixture.sessionId}/rounds`).get();
        (0, vitest_1.expect)(roundsSnap.size).toBeGreaterThan(0);
        // Each round should have matches
        const firstRound = roundsSnap.docs[0];
        const matchesSnap = await db.collection(`sessions/${fixture.sessionId}/rounds/${firstRound.id}/matches`).get();
        (0, vitest_1.expect)(matchesSnap.size).toBeGreaterThan(0);
    });
    (0, vitest_1.it)("flow 2: score entry → leaderboard updates", async () => {
        await callFunction("generateSchedule", { sessionId: fixture.sessionId }, ownerToken);
        await callFunction("startSession", { sessionId: fixture.sessionId }, ownerToken);
        // Get a match from round 1
        const matchesSnap = await db.collection(`sessions/${fixture.sessionId}/rounds/round_1/matches`).get();
        (0, vitest_1.expect)(matchesSnap.size).toBeGreaterThan(0);
        const match = matchesSnap.docs[0];
        const matchId = match.id;
        await callFunction("submitScore", {
            sessionId: fixture.sessionId,
            roundNumber: 1,
            matchId,
            payload: { winnerTeam: "A" },
        }, ownerToken);
        // Verify match is completed
        const matchDoc = await match.ref.get();
        (0, vitest_1.expect)(matchDoc.data()?.status).toBe("completed");
        (0, vitest_1.expect)(matchDoc.data()?.winnerTeam).toBe("A");
        (0, vitest_1.expect)(matchDoc.data()?.isLocked).toBe(true);
        // Verify leaderboard updated for team A players
        const teamAIds = matchDoc.data()?.teamAIds ?? [];
        for (const pid of teamAIds) {
            const lbDoc = await db.doc(`sessions/${fixture.sessionId}/leaderboard/${pid}`).get();
            (0, vitest_1.expect)(lbDoc.data()?.wins).toBe(1);
        }
    });
    (0, vitest_1.it)("flow 3: remove player → rebalance → completed match unchanged", async () => {
        await callFunction("generateSchedule", { sessionId: fixture.sessionId }, ownerToken);
        await callFunction("startSession", { sessionId: fixture.sessionId }, ownerToken);
        // Score round 1 match to lock it
        const matchesSnap = await db.collection(`sessions/${fixture.sessionId}/rounds/round_1/matches`).get();
        const match = matchesSnap.docs[0];
        await callFunction("submitScore", {
            sessionId: fixture.sessionId,
            roundNumber: 1,
            matchId: match.id,
            payload: { winnerTeam: "A" },
        }, ownerToken);
        const completedMatchBefore = (await match.ref.get()).data();
        // Remove a player not in the locked match
        const allPlayerIds = new Set(fixture.playerIds);
        const lockedPlayerIds = new Set([
            ...(completedMatchBefore?.teamAIds ?? []),
            ...(completedMatchBefore?.teamBIds ?? []),
        ]);
        const removablePlayer = [...allPlayerIds].find((pid) => !lockedPlayerIds.has(pid));
        await callFunction("updatePlayerStatus", {
            sessionId: fixture.sessionId,
            sessionPlayerId: removablePlayer,
            status: "removed",
        }, ownerToken);
        await callFunction("rebalanceSession", {
            sessionId: fixture.sessionId,
            trigger: "player_removed",
        }, ownerToken);
        // Completed match still has the same data
        const completedMatchAfter = (await match.ref.get()).data();
        (0, vitest_1.expect)(completedMatchAfter?.winnerTeam).toBe(completedMatchBefore?.winnerTeam);
        (0, vitest_1.expect)(completedMatchAfter?.status).toBe("completed");
        (0, vitest_1.expect)(completedMatchAfter?.isLocked).toBe(true);
    });
    (0, vitest_1.it)("flow 4: add late player → rebalance → they appear only from the next round", async () => {
        await callFunction("generateSchedule", { sessionId: fixture.sessionId }, ownerToken);
        await callFunction("startSession", { sessionId: fixture.sessionId }, ownerToken);
        await callFunction("addLatePlayer", {
            sessionId: fixture.sessionId,
            playerId: "late-p9",
            displayName: "Late Player 9",
        }, ownerToken);
        const sessionDoc = await db.doc(`sessions/${fixture.sessionId}`).get();
        const currentRound = sessionDoc.data()?.currentRoundNumber ?? 1;
        await callFunction("rebalanceSession", {
            sessionId: fixture.sessionId,
            trigger: "player_added",
        }, ownerToken);
        const latePlayerDoc = await db.doc(`sessions/${fixture.sessionId}/players/late-p9`).get();
        (0, vitest_1.expect)(latePlayerDoc.exists).toBe(true);
        (0, vitest_1.expect)(latePlayerDoc.data()?.availableFromRound).toBeGreaterThan(currentRound);
    });
    (0, vitest_1.it)("flow 5: permission denial — non-organiser cannot generate schedule", async () => {
        // Add a plain member
        await db.doc(`groups/${fixture.groupId}/members/member-only`).set({ role: "member" });
        const memberToken = await getIdToken("member-only");
        await (0, vitest_1.expect)(callFunction("generateSchedule", { sessionId: fixture.sessionId }, memberToken)).rejects.toThrow();
    });
    (0, vitest_1.it)("flow 6: score submission writes an audit log", async () => {
        await callFunction("generateSchedule", { sessionId: fixture.sessionId }, ownerToken);
        await callFunction("startSession", { sessionId: fixture.sessionId }, ownerToken);
        const matchesSnap = await db.collection(`sessions/${fixture.sessionId}/rounds/round_1/matches`).get();
        const match = matchesSnap.docs[0];
        const auditBefore = await db.collection(`sessions/${fixture.sessionId}/auditLogs`).get();
        const countBefore = auditBefore.size;
        await callFunction("submitScore", {
            sessionId: fixture.sessionId,
            roundNumber: 1,
            matchId: match.id,
            payload: { winnerTeam: "B" },
        }, ownerToken);
        const auditAfter = await db.collection(`sessions/${fixture.sessionId}/auditLogs`).get();
        (0, vitest_1.expect)(auditAfter.size).toBeGreaterThan(countBefore);
    });
});
(0, vitest_1.describe)("getScoreLinkData", () => {
    const scoreSessionId = "s-score-test";
    const scoreGroupId = "g-score-test";
    const scoreCode = "TESTSC";
    (0, vitest_1.beforeEach)(async () => {
        await db.doc(`groups/${scoreGroupId}`).set({ name: "Score Group", createdBy: "owner-score", memberIds: ["owner-score"] });
        await db.doc(`groups/${scoreGroupId}/members/owner-score`).set({ role: "owner" });
        await db.doc(`sessions/${scoreSessionId}`).set({
            groupId: scoreGroupId,
            name: "Score Session",
            sport: "badminton",
            status: "active",
            scoringMode: "winner_only",
            currentRoundNumber: 1,
            scoreCode,
            scoreLinkEnabled: true,
            courts: [{ courtId: "c1", name: "Court 1", courtNumber: 1, isActive: true }],
        });
        await db.doc(`sessions/${scoreSessionId}/rounds/round_1`).set({ roundNumber: 1, status: "in_progress" });
        await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).set({
            courtId: "c1",
            status: "in_progress",
            teamA: [{ playerId: "p1", displayName: "Alice" }, { playerId: "p2", displayName: "Bob" }],
            teamB: [{ playerId: "p3", displayName: "Carol" }, { playerId: "p4", displayName: "Dave" }],
            teamAIds: ["p1", "p2"],
            teamBIds: ["p3", "p4"],
        });
        for (const pid of ["p1", "p2", "p3", "p4"]) {
            await db.doc(`sessions/${scoreSessionId}/players/${pid}`).set({
                playerId: pid, displayName: pid, gamesPlayed: 0, wins: 0, losses: 0,
                pointsFor: 0, pointsAgainst: 0, pointDifference: 0,
            });
        }
    });
    (0, vitest_1.afterEach)(async () => {
        await db.recursiveDelete(db.doc(`sessions/${scoreSessionId}`));
        await db.recursiveDelete(db.doc(`groups/${scoreGroupId}`));
    });
    (0, vitest_1.it)("returns session info and courts with current match", async () => {
        const result = await callUnauthenticatedFunction("getScoreLinkData", { scoreCode });
        (0, vitest_1.expect)(result.sessionName).toBe("Score Session");
        (0, vitest_1.expect)(result.sport).toBe("badminton");
        (0, vitest_1.expect)(result.scoringMode).toBe("winner_only");
        (0, vitest_1.expect)(result.courts).toHaveLength(1);
        (0, vitest_1.expect)(result.courts[0].match.matchId).toBe("m1");
        (0, vitest_1.expect)(result.courts[0].match.teamA[0].displayName).toBe("Alice");
    });
    (0, vitest_1.it)("throws not-found for unknown scoreCode", async () => {
        await (0, vitest_1.expect)(callUnauthenticatedFunction("getScoreLinkData", { scoreCode: "XXXXXX" })).rejects.toThrow();
    });
    (0, vitest_1.it)("throws not-found when scoreLinkEnabled is false", async () => {
        await db.doc(`sessions/${scoreSessionId}`).update({ scoreLinkEnabled: false });
        await (0, vitest_1.expect)(callUnauthenticatedFunction("getScoreLinkData", { scoreCode })).rejects.toThrow();
    });
});
(0, vitest_1.describe)("submitScoreByLink", () => {
    const scoreSessionId = "s-submit-score-test";
    const scoreGroupId = "g-submit-score-test";
    const scoreCode = "SUBSC1";
    (0, vitest_1.beforeEach)(async () => {
        await db.doc(`groups/${scoreGroupId}`).set({ name: "Submit Group", createdBy: "owner-sub", memberIds: ["owner-sub"] });
        await db.doc(`sessions/${scoreSessionId}`).set({
            groupId: scoreGroupId,
            name: "Submit Session",
            sport: "badminton",
            status: "active",
            scoringMode: "winner_only",
            currentRoundNumber: 1,
            scoreCode,
            scoreLinkEnabled: true,
            courts: [{ courtId: "c1", name: "Court 1", courtNumber: 1, isActive: true }],
        });
        await db.doc(`sessions/${scoreSessionId}/rounds/round_1`).set({ roundNumber: 1, status: "in_progress" });
        await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).set({
            courtId: "c1",
            status: "in_progress",
            teamA: [{ playerId: "p1", displayName: "Alice" }, { playerId: "p2", displayName: "Bob" }],
            teamB: [{ playerId: "p3", displayName: "Carol" }, { playerId: "p4", displayName: "Dave" }],
            teamAIds: ["p1", "p2"],
            teamBIds: ["p3", "p4"],
        });
        for (const pid of ["p1", "p2", "p3", "p4"]) {
            await db.doc(`sessions/${scoreSessionId}/players/${pid}`).set({
                playerId: pid, displayName: pid, gamesPlayed: 0, wins: 0, losses: 0,
                pointsFor: 0, pointsAgainst: 0, pointDifference: 0,
            });
        }
    });
    (0, vitest_1.afterEach)(async () => {
        await db.recursiveDelete(db.doc(`sessions/${scoreSessionId}`));
        await db.recursiveDelete(db.doc(`groups/${scoreGroupId}`));
    });
    (0, vitest_1.it)("completes the match and updates leaderboard", async () => {
        const result = await callUnauthenticatedFunction("submitScoreByLink", {
            scoreCode,
            courtId: "c1",
            payload: { winnerTeam: "A" },
        });
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.winnerTeam).toBe("A");
        const matchSnap = await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).get();
        (0, vitest_1.expect)(matchSnap.data().status).toBe("completed");
        (0, vitest_1.expect)(matchSnap.data().isLocked).toBe(true);
        const lb1 = await db.doc(`sessions/${scoreSessionId}/leaderboard/p1`).get();
        (0, vitest_1.expect)(lb1.data().wins).toBe(1);
    });
    (0, vitest_1.it)("rejects if session is not active", async () => {
        await db.doc(`sessions/${scoreSessionId}`).update({ status: "draft" });
        await (0, vitest_1.expect)(callUnauthenticatedFunction("submitScoreByLink", {
            scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
        })).rejects.toThrow();
    });
    (0, vitest_1.it)("rejects if match is already completed", async () => {
        await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).update({ status: "completed" });
        await (0, vitest_1.expect)(callUnauthenticatedFunction("submitScoreByLink", {
            scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
        })).rejects.toThrow();
    });
    (0, vitest_1.it)("rejects if scoreLinkEnabled is false", async () => {
        await db.doc(`sessions/${scoreSessionId}`).update({ scoreLinkEnabled: false });
        await (0, vitest_1.expect)(callUnauthenticatedFunction("submitScoreByLink", {
            scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
        })).rejects.toThrow();
    });
});
(0, vitest_1.describe)("joinGroupByInvite", () => {
    const joinGroupId = "g-join-invite-test";
    const inviteCode = "JNVT01";
    (0, vitest_1.beforeEach)(async () => {
        await db.doc(`groups/${joinGroupId}`).set({
            name: "Invite Group",
            createdBy: "owner-join",
            memberIds: ["owner-join"],
            groupInviteCode: inviteCode,
        });
        await db.doc(`groups/${joinGroupId}/members/owner-join`).set({ role: "owner" });
    });
    (0, vitest_1.afterEach)(async () => {
        await db.recursiveDelete(db.doc(`groups/${joinGroupId}`));
    });
    (0, vitest_1.it)("adds caller as member", async () => {
        const newUserId = "new-user-invite";
        const token = await getIdToken(newUserId);
        const result = await callFunction("joinGroupByInvite", { inviteCode }, token);
        (0, vitest_1.expect)(result.groupId).toBe(joinGroupId);
        (0, vitest_1.expect)(result.role).toBe("member");
        const memberSnap = await db.doc(`groups/${joinGroupId}/members/${newUserId}`).get();
        (0, vitest_1.expect)(memberSnap.exists).toBe(true);
        (0, vitest_1.expect)(memberSnap.data().role).toBe("member");
    });
    (0, vitest_1.it)("is idempotent — returns existing role if already a member", async () => {
        const existingUserId = "existing-member";
        await db.doc(`groups/${joinGroupId}/members/${existingUserId}`).set({ userId: existingUserId, role: "organiser" });
        const token = await getIdToken(existingUserId);
        const result = await callFunction("joinGroupByInvite", { inviteCode }, token);
        (0, vitest_1.expect)(result.role).toBe("organiser");
    });
    (0, vitest_1.it)("rejects unauthenticated call", async () => {
        await (0, vitest_1.expect)(callUnauthenticatedFunction("joinGroupByInvite", { inviteCode })).rejects.toThrow();
    });
    (0, vitest_1.it)("rejects invalid invite code", async () => {
        const token = await getIdToken("some-user");
        await (0, vitest_1.expect)(callFunction("joinGroupByInvite", { inviteCode: "XXXXXX" }, token)).rejects.toThrow();
    });
});
