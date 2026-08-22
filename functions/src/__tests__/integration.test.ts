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
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as admin from "firebase-admin";

const PROJECT_ID = "picklebaddies-85732";
const REGION = "us-central1";
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}`;
const AUTH_EMULATOR_BASE = `http://127.0.0.1:9099`;

let db: admin.firestore.Firestore;

beforeAll(() => {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
  db = admin.firestore();
  db.settings({ host: "127.0.0.1:8080", ssl: false });
});

afterAll(async () => {
  const sessions = await db.collection("sessions").listDocuments();
  const groups = await db.collection("groups").listDocuments();
  await Promise.all([...sessions, ...groups].map((d) => d.delete()));
});

async function getIdToken(uid: string): Promise<string> {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `${AUTH_EMULATOR_BASE}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const json = (await res.json()) as any;
  if (!json.idToken) throw new Error(`Auth failed: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function callFunction(name: string, data: unknown, idToken: string) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as any;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function callUnauthenticatedFunction(name: string, data: unknown) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const json = (await res.json()) as any;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

describe("getScoreLinkData", () => {
  const scoreSessionId = "s-score-test";
  const scoreGroupId = "g-score-test";
  const scoreCode = "TESTSC";

  beforeEach(async () => {
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

  afterEach(async () => {
    await db.recursiveDelete(db.doc(`sessions/${scoreSessionId}`));
    await db.recursiveDelete(db.doc(`groups/${scoreGroupId}`));
  });

  it("returns session info and courts with current match", async () => {
    const result = await callUnauthenticatedFunction("getScoreLinkData", { scoreCode });
    expect(result.sessionName).toBe("Score Session");
    expect(result.sport).toBe("badminton");
    expect(result.scoringMode).toBe("winner_only");
    expect(result.courts).toHaveLength(1);
    expect(result.courts[0].match.matchId).toBe("m1");
    expect(result.courts[0].match.teamA[0].displayName).toBe("Alice");
  });

  it("throws not-found for unknown scoreCode", async () => {
    await expect(
      callUnauthenticatedFunction("getScoreLinkData", { scoreCode: "XXXXXX" })
    ).rejects.toThrow();
  });

  it("throws not-found when scoreLinkEnabled is false", async () => {
    await db.doc(`sessions/${scoreSessionId}`).update({ scoreLinkEnabled: false });
    await expect(
      callUnauthenticatedFunction("getScoreLinkData", { scoreCode })
    ).rejects.toThrow();
  });
});

describe("submitScoreByLink", () => {
  const scoreSessionId = "s-submit-score-test";
  const scoreGroupId = "g-submit-score-test";
  const scoreCode = "SUBSC1";

  beforeEach(async () => {
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

  afterEach(async () => {
    await db.recursiveDelete(db.doc(`sessions/${scoreSessionId}`));
    await db.recursiveDelete(db.doc(`groups/${scoreGroupId}`));
  });

  it("completes the match and updates leaderboard", async () => {
    const result = await callUnauthenticatedFunction("submitScoreByLink", {
      scoreCode,
      courtId: "c1",
      payload: { winnerTeam: "A" },
    });
    expect(result.success).toBe(true);
    expect(result.winnerTeam).toBe("A");

    const matchSnap = await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).get();
    expect(matchSnap.data()!.status).toBe("completed");
    expect(matchSnap.data()!.isLocked).toBe(true);

    const lb1 = await db.doc(`sessions/${scoreSessionId}/leaderboard/p1`).get();
    expect(lb1.data()!.wins).toBe(1);
  });

  it("rejects if session is not active", async () => {
    await db.doc(`sessions/${scoreSessionId}`).update({ status: "draft" });
    await expect(
      callUnauthenticatedFunction("submitScoreByLink", {
        scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
      })
    ).rejects.toThrow();
  });

  it("rejects if match is already completed", async () => {
    await db.doc(`sessions/${scoreSessionId}/rounds/round_1/matches/m1`).update({ status: "completed" });
    await expect(
      callUnauthenticatedFunction("submitScoreByLink", {
        scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
      })
    ).rejects.toThrow();
  });

  it("rejects if scoreLinkEnabled is false", async () => {
    await db.doc(`sessions/${scoreSessionId}`).update({ scoreLinkEnabled: false });
    await expect(
      callUnauthenticatedFunction("submitScoreByLink", {
        scoreCode, courtId: "c1", payload: { winnerTeam: "A" },
      })
    ).rejects.toThrow();
  });
});

describe("joinGroupByInvite", () => {
  const joinGroupId = "g-join-invite-test";
  const inviteCode = "JNVT01";

  beforeEach(async () => {
    await db.doc(`groups/${joinGroupId}`).set({
      name: "Invite Group",
      createdBy: "owner-join",
      memberIds: ["owner-join"],
      groupInviteCode: inviteCode,
    });
    await db.doc(`groups/${joinGroupId}/members/owner-join`).set({ role: "owner" });
  });

  afterEach(async () => {
    await db.recursiveDelete(db.doc(`groups/${joinGroupId}`));
  });

  it("adds caller as member", async () => {
    const newUserId = "new-user-invite";
    const token = await getIdToken(newUserId);
    const result = await callFunction("joinGroupByInvite", { inviteCode }, token);
    expect(result.groupId).toBe(joinGroupId);
    expect(result.role).toBe("member");

    const memberSnap = await db.doc(`groups/${joinGroupId}/members/${newUserId}`).get();
    expect(memberSnap.exists).toBe(true);
    expect(memberSnap.data()!.role).toBe("member");
  });

  it("is idempotent - returns existing role if already a member", async () => {
    const existingUserId = "existing-member";
    await db.doc(`groups/${joinGroupId}/members/${existingUserId}`).set({ userId: existingUserId, role: "organiser" });
    const token = await getIdToken(existingUserId);
    const result = await callFunction("joinGroupByInvite", { inviteCode }, token);
    expect(result.role).toBe("organiser");
  });

  it("rejects unauthenticated call", async () => {
    await expect(
      callUnauthenticatedFunction("joinGroupByInvite", { inviteCode })
    ).rejects.toThrow();
  });

  it("rejects invalid invite code", async () => {
    const token = await getIdToken("some-user");
    await expect(
      callFunction("joinGroupByInvite", { inviteCode: "XXXXXX" }, token)
    ).rejects.toThrow();
  });
});
