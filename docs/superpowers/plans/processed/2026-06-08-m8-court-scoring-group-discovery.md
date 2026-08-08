# M8 Implementation Plan: Court-link Scoring + Group & Session Discovery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let courts self-report scores via a shareless link, and let users discover + join sessions through a group invite flow, with a "My Sessions" dashboard view.

**Architecture:** Two independent workstreams — Workstream A adds `scoreCode` to sessions, two unauthenticated Cloud Functions (`getScoreLinkData`, `submitScoreByLink`), and a public `/score/[scoreCode]` page. Workstream B adds `groupInviteCode` to groups, one authenticated Cloud Function (`joinGroupByInvite`), a `/join/group/[inviteCode]` page, a Sessions tab on the group page, and a My Sessions section on the dashboard.

**Tech Stack:** Firebase Cloud Functions v2 (Node 20, CommonJS), Firestore, Next.js 15 App Router (React 19), TypeScript, `@picklebaddies/domain` for shared logic.

**Spec:** `docs/superpowers/specs/2026-06-08-m8-court-scoring-group-discovery-design.md`

---

## File Map

**New files:**
- `functions/src/scoreLink.ts` — `getScoreLinkData` + `submitScoreByLink` Cloud Functions
- `functions/src/groupInvite.ts` — `joinGroupByInvite` Cloud Function
- `apps/web/src/lib/sessions/score-link.ts` — client wrappers for score-link callables
- `apps/web/src/lib/groups/invite.ts` — client wrapper for `joinGroupByInvite`
- `apps/web/src/app/score/[scoreCode]/page.tsx` — public score entry page (no auth)
- `apps/web/src/app/join/group/[inviteCode]/page.tsx` — group invite landing page

**Modified files:**
- `firestore.indexes.json` — composite indexes for group session queries
- `functions/src/index.ts` — export new functions
- `functions/src/__tests__/integration.test.ts` — tests for new functions
- `apps/web/src/lib/sessions/types.ts` — add `scoreCode`, `scoreLinkEnabled` to `Session`
- `apps/web/src/lib/sessions/sessions.ts` — `scoreCode` in `createSession`, add `watchGroupSessions`, `watchMySessions`
- `apps/web/src/lib/groups/groups.ts` — `groupInviteCode` in `createGroup`, add `regenerateGroupInviteCode`
- `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx` — Score Link card
- `apps/web/src/app/(app)/groups/[groupId]/page.tsx` — Sessions tab + Invite Link section
- `apps/web/src/app/(app)/dashboard/page.tsx` — My Sessions section
- `apps/web/src/app/sign-in/page.tsx` — honor `?redirect=` query param

---

## Task 1: Data model — Firestore indexes + scoreCode + groupInviteCode

**Files:**
- Modify: `firestore.indexes.json`
- Modify: `apps/web/src/lib/sessions/types.ts`
- Modify: `apps/web/src/lib/sessions/sessions.ts`
- Modify: `apps/web/src/lib/groups/groups.ts`

- [ ] **Step 1: Update Firestore indexes**

Replace `firestore.indexes.json` entirely:

```json
{
  "indexes": [
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "groupId", "order": "ASCENDING" },
        { "fieldPath": "startsAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "startsAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": [
    {
      "collectionGroup": "players",
      "fieldPath": "playerId",
      "queryScope": "COLLECTION_GROUP",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Add `scoreCode` and `scoreLinkEnabled` to Session type**

In `apps/web/src/lib/sessions/types.ts`, add two fields to the `Session` interface after `joinEnabled`:

```ts
  joinEnabled: boolean;
  scoreCode: string;
  scoreLinkEnabled: boolean;
```

- [ ] **Step 3: Generate `scoreCode` in `createSession`**

In `apps/web/src/lib/sessions/sessions.ts`, inside the `addDoc` call in `createSession`, add after `joinEnabled: true,`:

```ts
    scoreCode: generateJoinCode(),
    scoreLinkEnabled: true,
```

- [ ] **Step 4: Generate `groupInviteCode` in `createGroup`**

In `apps/web/src/lib/groups/groups.ts`, add the import at the top (after existing imports):

```ts
import { generateJoinCode } from "@picklebaddies/domain";
```

Then inside `createGroup`'s `addDoc` call, add after `updatedAt: serverTimestamp(),`:

```ts
    groupInviteCode: generateJoinCode(),
```

- [ ] **Step 5: Run typecheck to confirm no errors**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add firestore.indexes.json apps/web/src/lib/sessions/types.ts apps/web/src/lib/sessions/sessions.ts apps/web/src/lib/groups/groups.ts
git commit -m "feat(m8): add scoreCode/groupInviteCode to data model + Firestore indexes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `getScoreLinkData` Cloud Function

**Files:**
- Create: `functions/src/scoreLink.ts`

- [ ] **Step 1: Create `functions/src/scoreLink.ts` with `getScoreLinkData`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeJoinCode } from "@picklebaddies/domain";
import { assertString } from "./lib/validation.js";

export const getScoreLinkData = onCall({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const scoreCode = normalizeJoinCode(rawCode);

  const db = getFirestore();
  const q = await db.collection("sessions")
    .where("scoreCode", "==", scoreCode)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invalid or disabled score link.");

  const sessionDoc = q.docs[0]!;
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

  const activeCourts: Array<{ courtId: string; name: string }> =
    (session.courts as Array<{ courtId: string; name: string; isActive: boolean }>)
      .filter((c) => c.isActive !== false);

  const matchSnaps = await Promise.all(
    activeCourts.map((court) =>
      db.collection(`sessions/${sessionId}/rounds/round_${session.currentRoundNumber}/matches`)
        .where("courtId", "==", court.courtId)
        .limit(1)
        .get()
    )
  );

  const courts = activeCourts.map((court, i) => {
    const matchDoc = matchSnaps[i]!.docs[0];
    if (!matchDoc || matchDoc.data().status === "cancelled") {
      return { courtId: court.courtId, courtName: court.name, match: null };
    }
    const m = matchDoc.data();
    return {
      courtId: court.courtId,
      courtName: court.name,
      match: {
        matchId: matchDoc.id,
        teamA: (m.teamA as Array<{ playerId: string; displayName: string }>).map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
        teamB: (m.teamB as Array<{ playerId: string; displayName: string }>).map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
        status: m.status as string,
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
```

- [ ] **Step 2: Build functions to confirm no compile errors**

```bash
pnpm --filter @picklebaddies/functions build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add functions/src/scoreLink.ts
git commit -m "feat(m8): add getScoreLinkData Cloud Function

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: `submitScoreByLink` Cloud Function

**Files:**
- Modify: `functions/src/scoreLink.ts`

- [ ] **Step 1: Add `submitScoreByLink` to `functions/src/scoreLink.ts`**

Add this import block at the top of the file (alongside existing imports):

```ts
import { FieldValue } from "firebase-admin/firestore";
import { deriveWinner, type ScorePayload } from "@picklebaddies/domain";
import { assertScorePayload } from "./lib/validation.js";
import { checkRateLimit } from "./lib/rateLimit.js";
import { writeAudit } from "./lib/audit.js";
```

Then append this export after `getScoreLinkData`:

```ts
export const submitScoreByLink = onCall({ cors: true, invoker: "public" }, async (request) => {
  const rawCode = assertString(request.data?.scoreCode, "scoreCode");
  const courtId = assertString(request.data?.courtId, "courtId");
  const rawPayload = request.data?.payload as ScorePayload;

  const ip: string = (request.rawRequest as any)?.ip || "unknown";
  const scoreCode = normalizeJoinCode(rawCode);

  await checkRateLimit(scoreCode, ip);

  const db = getFirestore();
  const q = await db.collection("sessions")
    .where("scoreCode", "==", scoreCode)
    .where("scoreLinkEnabled", "==", true)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invalid or disabled score link.");

  const sessionDoc = q.docs[0]!;
  const sessionId = sessionDoc.id;
  const session = sessionDoc.data();

  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "Session is not active.");
  }

  const roundNumber: number = session.currentRoundNumber || 0;
  if (roundNumber === 0) throw new HttpsError("failed-precondition", "No active round.");

  return db.runTransaction(async (transaction) => {
    const matchQuery = await db
      .collection(`sessions/${sessionId}/rounds/round_${roundNumber}/matches`)
      .where("courtId", "==", courtId)
      .limit(1)
      .get();

    if (matchQuery.empty) {
      throw new HttpsError("not-found", "No match found on that court.");
    }

    const matchDoc = matchQuery.docs[0]!;
    const match = matchDoc.data();
    const matchRef = matchDoc.ref;

    if (match.status === "completed") {
      throw new HttpsError("failed-precondition", "Match already scored.");
    }
    if (match.status === "cancelled") {
      throw new HttpsError("failed-precondition", "Match is cancelled.");
    }

    const payload = assertScorePayload(rawPayload, session.scoringMode);
    const winnerTeam = deriveWinner(payload, session.scoringMode);

    const teamAIds: string[] = match.teamAIds || match.teamA.map((p: any) => p.playerId);
    const teamBIds: string[] = match.teamBIds || match.teamB.map((p: any) => p.playerId);
    const allPlayerIds = [...teamAIds, ...teamBIds];

    const playerStatsRefs = allPlayerIds.map((id) =>
      db.doc(`sessions/${sessionId}/players/${id}`)
    );
    const leaderboardRefs = allPlayerIds.map((id) =>
      db.doc(`sessions/${sessionId}/leaderboard/${id}`)
    );

    const [playerStatsDocs, leaderboardDocs] = await Promise.all([
      Promise.all(playerStatsRefs.map((ref) => transaction.get(ref))),
      Promise.all(leaderboardRefs.map((ref) => transaction.get(ref))),
    ]);

    const updateStats = (docData: any, playerId: string) => {
      const stats = docData || {
        gamesPlayed: 0, wins: 0, losses: 0,
        pointsFor: 0, pointsAgainst: 0, pointDifference: 0,
      };
      const isTeamA = teamAIds.includes(playerId);
      const isWinner = winnerTeam === (isTeamA ? "A" : "B");
      const rawFor = isTeamA ? (payload as any).teamAScore : (payload as any).teamBScore;
      const rawAgainst = isTeamA ? (payload as any).teamBScore : (payload as any).teamAScore;
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
        pointDifference: (stats.pointDifference || 0) + (hasPoints ? pFor! - pAgainst! : 0),
      };
    };

    transaction.update(matchRef, {
      scorePayload: payload,
      winnerTeam,
      status: "completed",
      isLocked: true,
      completedAt: FieldValue.serverTimestamp(),
    });

    for (let i = 0; i < allPlayerIds.length; i++) {
      const pid = allPlayerIds[i]!;
      transaction.set(playerStatsRefs[i]!, updateStats(playerStatsDocs[i]?.data(), pid), { merge: true });
      transaction.set(leaderboardRefs[i]!, updateStats(leaderboardDocs[i]?.data(), pid), { merge: true });
    }

    writeAudit(transaction, sessionId, {
      actorUid: "court_link",
      action: "score",
      details: { matchId: matchDoc.id, roundNumber, courtId, payload, winnerTeam, source: "court_link", ip },
    });

    const courtName: string =
      (session.courts as Array<{ courtId: string; name: string }>)
        .find((c) => c.courtId === courtId)?.name ?? courtId;

    return { success: true, courtName, winnerTeam };
  });
});
```

- [ ] **Step 2: Build functions to confirm no compile errors**

```bash
pnpm --filter @picklebaddies/functions build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add functions/src/scoreLink.ts
git commit -m "feat(m8): add submitScoreByLink Cloud Function

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `joinGroupByInvite` Cloud Function

**Files:**
- Create: `functions/src/groupInvite.ts`

- [ ] **Step 1: Create `functions/src/groupInvite.ts`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { normalizeJoinCode } from "@picklebaddies/domain";
import { assertString } from "./lib/validation.js";
import { writeAudit } from "./lib/audit.js";

export const joinGroupByInvite = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in to join a group.");

  const rawCode = assertString(request.data?.inviteCode, "inviteCode");
  const inviteCode = normalizeJoinCode(rawCode);
  const uid = request.auth.uid;

  const db = getFirestore();
  const q = await db.collection("groups")
    .where("groupInviteCode", "==", inviteCode)
    .limit(1)
    .get();

  if (q.empty) throw new HttpsError("not-found", "Invite link is no longer valid.");

  const groupDoc = q.docs[0]!;
  const groupId = groupDoc.id;

  const memberRef = db.doc(`groups/${groupId}/members/${uid}`);
  const memberSnap = await memberRef.get();

  if (memberSnap.exists) {
    return { groupId, role: memberSnap.data()!.role };
  }

  await db.runTransaction(async (t) => {
    const groupRef = db.doc(`groups/${groupId}`);
    t.set(memberRef, {
      userId: uid,
      role: "member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(groupRef, {
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAudit(t, groupId, {
      actorUid: uid,
      action: "group/member_joined_by_invite",
      details: { groupId, inviteCode },
    });
  });

  return { groupId, role: "member" };
});
```

Note: `writeAudit` writes to `sessions/{sessionId}/auditLogs`. For group events, pass `groupId` as the first arg — the audit log will be written to `groups/{groupId}/auditLogs` conceptually but the function writes to `sessions/${groupId}/auditLogs`. This is acceptable for MVP; a proper group audit log path is a future cleanup.

Actually, `writeAudit` writes to `sessions/${sessionId}/auditLogs`. For the group invite action, audit is a nice-to-have — skip `writeAudit` here to avoid writing to the wrong path. Replace those 3 lines with just the transaction (no `writeAudit`):

```ts
  await db.runTransaction(async (t) => {
    const groupRef = db.doc(`groups/${groupId}`);
    t.set(memberRef, {
      userId: uid,
      role: "member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(groupRef, {
      memberIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
```

(Remove the `writeAudit` import and call from this file.)

- [ ] **Step 2: Build to confirm no compile errors**

```bash
pnpm --filter @picklebaddies/functions build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add functions/src/groupInvite.ts
git commit -m "feat(m8): add joinGroupByInvite Cloud Function

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Export new functions + integration tests

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/src/__tests__/integration.test.ts`

- [ ] **Step 1: Export new functions from `functions/src/index.ts`**

Add at the end of `index.ts`:

```ts
export { getScoreLinkData, submitScoreByLink } from "./scoreLink.js";
export { joinGroupByInvite } from "./groupInvite.js";
```

- [ ] **Step 2: Build to confirm exports compile**

```bash
pnpm --filter @picklebaddies/functions build
```

Expected: build succeeds.

- [ ] **Step 3: Add `callUnauthenticatedFunction` helper to integration test file**

In `functions/src/__tests__/integration.test.ts`, add this helper after the existing `callFunction` function:

```ts
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
```

- [ ] **Step 4: Add fixture helper and score-link tests to `integration.test.ts`**

Add a new `describe` block at the end of the file:

```ts
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

  it("is idempotent — returns existing role if already a member", async () => {
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
```

- [ ] **Step 5: Run integration tests (requires emulators running)**

Start emulators in a separate terminal first:
```bash
pnpm emulators
```

Then in another terminal:
```bash
pnpm --filter @picklebaddies/functions test:int
```

Expected: all new tests pass.

- [ ] **Step 6: Commit**

```bash
git add functions/src/index.ts functions/src/__tests__/integration.test.ts
git commit -m "feat(m8): export new functions + add integration tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Client service layer

**Files:**
- Create: `apps/web/src/lib/sessions/score-link.ts`
- Create: `apps/web/src/lib/groups/invite.ts`
- Modify: `apps/web/src/lib/groups/groups.ts`

- [ ] **Step 1: Create `apps/web/src/lib/sessions/score-link.ts`**

```ts
import { httpsCallable } from "firebase/functions";
import { getFirebaseServices } from "@/lib/firebase/client";
import type { ScorePayload } from "@picklebaddies/domain";

export interface ScoreLinkCourtMatch {
  matchId: string;
  teamA: Array<{ playerId: string; displayName: string }>;
  teamB: Array<{ playerId: string; displayName: string }>;
  status: string;
}

export interface ScoreLinkCourt {
  courtId: string;
  courtName: string;
  match: ScoreLinkCourtMatch | null;
}

export interface ScoreLinkData {
  sessionId: string;
  sessionName: string;
  sport: "badminton" | "pickleball";
  scoringMode: "winner_only" | "points";
  currentRoundNumber: number;
  sessionStatus: string;
  courts: ScoreLinkCourt[];
}

export async function getScoreLinkData(scoreCode: string): Promise<ScoreLinkData> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<{ scoreCode: string }, ScoreLinkData>(functions, "getScoreLinkData");
  const result = await fn({ scoreCode });
  return result.data;
}

export async function submitScoreByLink(
  scoreCode: string,
  courtId: string,
  payload: ScorePayload,
): Promise<{ success: boolean; courtName: string; winnerTeam: "A" | "B" }> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<
    { scoreCode: string; courtId: string; payload: ScorePayload },
    { success: boolean; courtName: string; winnerTeam: "A" | "B" }
  >(functions, "submitScoreByLink");
  const result = await fn({ scoreCode, courtId, payload });
  return result.data;
}
```

- [ ] **Step 2: Create `apps/web/src/lib/groups/invite.ts`**

```ts
import { httpsCallable } from "firebase/functions";
import { doc, updateDoc } from "firebase/firestore";
import { getFirebaseServices } from "@/lib/firebase/client";
import { generateJoinCode } from "@picklebaddies/domain";

export async function joinGroupByInvite(
  inviteCode: string,
): Promise<{ groupId: string; role: string }> {
  const { functions } = getFirebaseServices();
  const fn = httpsCallable<
    { inviteCode: string },
    { groupId: string; role: string }
  >(functions, "joinGroupByInvite");
  const result = await fn({ inviteCode });
  return result.data;
}

export async function regenerateGroupInviteCode(groupId: string): Promise<string> {
  const { db } = getFirebaseServices();
  const newCode = generateJoinCode();
  await updateDoc(doc(db, "groups", groupId), { groupInviteCode: newCode });
  return newCode;
}
```

- [ ] **Step 3: Add `watchGroupSessions` and `watchMySessions` to `apps/web/src/lib/sessions/sessions.ts`**

Add these imports at the top of `sessions.ts` (alongside existing imports):

```ts
import { query, where, orderBy, collectionGroup, getDocs } from "firebase/firestore";
```

(Some of these may already be imported — only add what's missing.)

Then append these two functions at the end of `sessions.ts`:

```ts
export type SessionSummary = {
  id: string;
  name: string;
  sport: "badminton" | "pickleball";
  status: string;
  startsAt: unknown;
  venueName: string;
  courtCount: number;
  createdBy: string;
  joinCode: string;
  groupId: string;
};

export function watchGroupSessions(
  groupId: string,
  cb: (sessions: SessionSummary[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const { db } = getFirebaseServices();
  const q = query(
    collection(db, "sessions"),
    where("groupId", "==", groupId),
    orderBy("startsAt", "desc"),
  );
  const unsub = onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) })));
  }, onError);
  return () => safeUnsubscribe(unsub);
}

export async function fetchMySessions(uid: string): Promise<{
  organising: SessionSummary[];
  playing: SessionSummary[];
}> {
  const { db } = getFirebaseServices();

  const [orgSnap, playerSnap] = await Promise.all([
    getDocs(query(collection(db, "sessions"), where("createdBy", "==", uid), orderBy("startsAt", "desc"))),
    getDocs(query(collectionGroup(db, "players"), where("playerId", "==", uid))),
  ]);

  const organising = orgSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) }));

  const playingSessionIds = [...new Set(
    playerSnap.docs.map((d) => d.ref.parent.parent!.id)
  )];
  const orgIds = new Set(organising.map((s) => s.id));
  const nonOrgPlayingIds = playingSessionIds.filter((id) => !orgIds.has(id));

  const playingDocs = await Promise.all(
    nonOrgPlayingIds.map((id) =>
      getDocs(query(collection(db, "sessions"), where("__name__", "==", id))).then((s) => s.docs[0])
    )
  );

  const playing = playingDocs
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SessionSummary, "id">) }));

  return { organising, playing };
}
```

Note: `collectionGroup` needs to be imported from `firebase/firestore` in `sessions.ts`. The existing import line is:
```ts
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, onSnapshot } from "firebase/firestore";
```
Update it to also include `query`, `where`, `orderBy`, `collectionGroup`, `getDocs`:
```ts
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, onSnapshot, query, where, orderBy, collectionGroup, getDocs } from "firebase/firestore";
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sessions/score-link.ts apps/web/src/lib/groups/invite.ts apps/web/src/lib/sessions/sessions.ts
git commit -m "feat(m8): add client service layer for score link, group invite, and session queries

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Sign-in redirect support

**Files:**
- Modify: `apps/web/src/app/sign-in/page.tsx`

- [ ] **Step 1: Read `useSearchParams` in the sign-in page and redirect after sign-in**

The sign-in page currently always redirects to `/dashboard`. Update it to honor a `?redirect=` query param.

At the top of `apps/web/src/app/sign-in/page.tsx`, add `useSearchParams` to the Next.js import:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

Inside `SignInPage`, add after `const router = useRouter();`:

```ts
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
```

Then in the `run` function, change `router.push("/dashboard")` to:

```ts
      router.push(redirectTo);
```

- [ ] **Step 2: Wrap the page export in a Suspense boundary (required for `useSearchParams`)**

Next.js requires `useSearchParams` to be wrapped in `<Suspense>`. Replace the default export at the bottom of the file:

```ts
import { Suspense } from "react";

function SignInForm() {
  // ... entire existing SignInPage function body goes here, renamed to SignInForm
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
```

Rename the existing `export default function SignInPage()` to `function SignInForm()` and wrap it.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/sign-in/page.tsx
git commit -m "feat(m8): sign-in page honors ?redirect= query param

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Public `/score/[scoreCode]` page

**Files:**
- Create: `apps/web/src/app/score/[scoreCode]/page.tsx`

- [ ] **Step 1: Create the directory and page file**

Create `apps/web/src/app/score/[scoreCode]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import {
  getScoreLinkData,
  submitScoreByLink,
  type ScoreLinkData,
  type ScoreLinkCourt,
} from "@/lib/sessions/score-link";

type SubmitState = "idle" | "submitting" | "done" | "error";

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function ScoreLinkPage({ params }: { params: Promise<{ scoreCode: string }> }) {
  const { scoreCode } = use(params);

  const [data, setData] = useState<ScoreLinkData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeCourt, setActiveCourt] = useState<string | null>(null);
  const [pointA, setPointA] = useState("");
  const [pointB, setPointB] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    getScoreLinkData(scoreCode)
      .then(setData)
      .catch((e) => setLoadError(e.message || "Failed to load session."));
  }, [scoreCode]);

  const handleCourtTap = (courtId: string) => {
    setActiveCourt((prev) => (prev === courtId ? null : courtId));
    setPointA("");
    setPointB("");
    setSubmitError("");
    setSubmitState("idle");
  };

  const handleSubmit = async (court: ScoreLinkCourt, winner?: "A" | "B") => {
    if (!data || !court.match) return;
    setSubmitState("submitting");
    setSubmitError("");
    try {
      const payload =
        data.scoringMode === "winner_only"
          ? { winnerTeam: winner! }
          : { teamAScore: Number(pointA), teamBScore: Number(pointB) };

      const result = await submitScoreByLink(scoreCode, court.courtId, payload as any);
      setSubmitMsg(`${result.courtName} — Team ${result.winnerTeam} wins!`);
      setSubmitState("done");
      setActiveCourt(null);
      // Refresh data
      const fresh = await getScoreLinkData(scoreCode);
      setData(fresh);
    } catch (e: any) {
      setSubmitState("error");
      setSubmitError(e.message || "Failed to submit score.");
    }
  };

  if (loadError) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center", padding: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 800 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Loading…
        </span>
      </div>
    );
  }

  const sessionNotActive = data.sessionStatus !== "active";

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "2rem" }}>
      {/* Header */}
      <header style={{ background: "var(--ink-800)", padding: "1.25rem 1.25rem 1rem", position: "relative", overflow: "hidden" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, rgba(198,241,53,0.05) 0 1px, transparent 1px 18px)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "rgba(246,248,244,0.55)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {titleCase(data.sport)} · Round {data.currentRoundNumber}
          </span>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 900, color: "var(--n-50)", textTransform: "uppercase", letterSpacing: "-0.025em", marginTop: "0.25rem" }}>
            {data.sessionName}
          </h1>
          <p style={{ color: "rgba(246,248,244,0.6)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Tap a court to enter the result
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "1rem 1.25rem", display: "grid", gap: "0.75rem" }}>
        {submitState === "done" && (
          <div style={{ background: "rgba(198,241,53,0.18)", border: "1px solid var(--volt-500)", borderRadius: "var(--r-xl)", padding: "1rem", fontWeight: 800, color: "var(--ink-800)", textAlign: "center" }}>
            {submitMsg}
          </div>
        )}

        {sessionNotActive && (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontWeight: 700 }}>Scoring not available — session is {data.sessionStatus}.</p>
          </div>
        )}

        {!sessionNotActive && data.courts.map((court) => {
          const isActive = activeCourt === court.courtId;
          const isCompleted = court.match?.status === "completed";
          return (
            <div key={court.courtId} style={{ background: "var(--surface)", border: `1px solid ${isActive ? "var(--volt-500)" : "var(--border)"}`, borderRadius: "var(--r-xl)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              <button
                type="button"
                onClick={() => !isCompleted && handleCourtTap(court.courtId)}
                disabled={isCompleted || !court.match}
                style={{ width: "100%", background: "none", border: "none", padding: "1rem", cursor: isCompleted || !court.match ? "default" : "pointer", textAlign: "left" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.125rem", fontWeight: 900, letterSpacing: "-0.02em" }}>{court.courtName}</span>
                  {isCompleted && (
                    <span style={{ padding: "3px 8px", borderRadius: "var(--r-pill)", background: "rgba(198,241,53,0.18)", color: "var(--ink-800)", fontSize: "0.75rem", fontWeight: 800 }}>Scored</span>
                  )}
                  {!court.match && (
                    <span style={{ padding: "3px 8px", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", color: "var(--text-3)", fontSize: "0.75rem" }}>No match</span>
                  )}
                </div>
                {court.match && (
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9375rem", color: "var(--text-2)" }}>
                    <span style={{ fontWeight: 700 }}>{court.match.teamA.map((p) => p.displayName).join(" & ")}</span>
                    <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>vs</span>
                    <span style={{ fontWeight: 700 }}>{court.match.teamB.map((p) => p.displayName).join(" & ")}</span>
                  </div>
                )}
              </button>

              {isActive && court.match && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "1rem", background: "var(--surface-sunken)" }}>
                  {submitError && (
                    <p style={{ color: "var(--danger)", fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.875rem" }}>{submitError}</p>
                  )}
                  {data.scoringMode === "winner_only" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court, "A")}
                        disabled={submitState === "submitting"}
                        style={{ padding: "0.875rem", border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.9375rem" }}
                      >
                        {court.match.teamA.map((p) => p.displayName.split(" ")[0]).join(" & ")} win
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court, "B")}
                        disabled={submitState === "submitting"}
                        style={{ padding: "0.875rem", border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer", fontSize: "0.9375rem" }}
                      >
                        {court.match.teamB.map((p) => p.displayName.split(" ")[0]).join(" & ")} win
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0.5rem", alignItems: "center" }}>
                        <div>
                          <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "0.25rem" }}>
                            {court.match.teamA.map((p) => p.displayName.split(" ")[0]).join(" & ")}
                          </label>
                          <input
                            className="pb-input"
                            type="number"
                            min={0}
                            value={pointA}
                            onChange={(e) => setPointA(e.target.value)}
                            style={{ height: 52, borderRadius: "var(--r-md)", fontSize: "1.5rem", fontWeight: 900, textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                        <span style={{ fontFamily: "var(--font-display-tight)", fontWeight: 900, color: "var(--text-3)" }}>vs</span>
                        <div>
                          <label style={{ fontFamily: "var(--font-mono)", fontSize: "0.625rem", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: "0.25rem" }}>
                            {court.match.teamB.map((p) => p.displayName.split(" ")[0]).join(" & ")}
                          </label>
                          <input
                            className="pb-input"
                            type="number"
                            min={0}
                            value={pointB}
                            onChange={(e) => setPointB(e.target.value)}
                            style={{ height: 52, borderRadius: "var(--r-md)", fontSize: "1.5rem", fontWeight: 900, textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSubmit(court)}
                        disabled={submitState === "submitting" || !pointA || !pointB || pointA === pointB}
                        style={{ height: 48, border: "none", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 900, cursor: "pointer" }}
                      >
                        {submitState === "submitting" ? "Submitting…" : "Submit Result"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/score/
git commit -m "feat(m8): add public /score/[scoreCode] page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Score Link card on session detail page

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`

- [ ] **Step 1: Add the Score Link card to the session detail page**

In `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`, add to the imports at the top:

```ts
import { updateSessionDraft } from "@/lib/sessions/sessions";
```

Then, directly after the `handleCopyJoinLink` function, add:

```ts
  const scoreLinkPath = session.scoreCode ? `/score/${session.scoreCode}` : null;

  const handleCopyScoreLink = async () => {
    if (!scoreLinkPath) return;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    await navigator.clipboard?.writeText(`${origin}${scoreLinkPath}`);
  };

  const handleToggleScoreLink = async () => {
    await updateSessionDraft(sessionId, { scoreLinkEnabled: !session.scoreLinkEnabled });
  };
```

Then, in the JSX, after the existing "Invite Link" card and before the "Courts" card (inside the two-column grid section), insert:

```tsx
        {canManage && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "1rem",
            boxShadow: "var(--shadow-sm)",
            animation: "pb-rise 400ms 90ms var(--ease-out) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem" }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--r-lg)", background: "var(--volt-500)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.25rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                  Score Link
                </h2>
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>Courts enter results without signing in.</p>
              </div>
              <button
                type="button"
                onClick={handleToggleScoreLink}
                aria-label={session.scoreLinkEnabled ? "Disable score link" : "Enable score link"}
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: "var(--r-pill)",
                  background: session.scoreLinkEnabled ? "var(--volt-500)" : "var(--n-300)",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background 150ms",
                }}
              >
                <span style={{
                  position: "absolute",
                  top: 3,
                  left: session.scoreLinkEnabled ? 20 : 3,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 150ms",
                }} />
              </button>
            </div>

            {scoreLinkPath && (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "0.625rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem" }}>
                <a href={scoreLinkPath} style={{ color: "var(--emerald-600)", fontWeight: 800, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}${scoreLinkPath}` : scoreLinkPath}
                </a>
                <button
                  type="button"
                  onClick={handleCopyScoreLink}
                  disabled={!session.scoreLinkEnabled}
                  style={{ width: 48, height: 48, border: "none", borderRadius: "var(--r-md)", background: session.scoreLinkEnabled ? "var(--ink-800)" : "var(--n-200)", color: "var(--volt-500)", display: "grid", placeItems: "center", cursor: session.scoreLinkEnabled ? "pointer" : "not-allowed" }}
                  aria-label="Copy score link"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(app)/sessions/[sessionId]/page.tsx
git commit -m "feat(m8): add score link card to session detail page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Sessions tab + Invite Link section on group page

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

- [ ] **Step 1: Add imports and session/invite state to the group page**

At the top of `apps/web/src/app/(app)/groups/[groupId]/page.tsx`, add to existing imports:

```ts
import { watchGroupSessions, type SessionSummary } from "@/lib/sessions/sessions";
import { requestJoin } from "@/lib/sessions/join";
import { useAuth } from "@/lib/auth/useAuth";
import { regenerateGroupInviteCode } from "@/lib/groups/invite";
import { canManageGroup as checkCanManageGroup } from "@picklebaddies/domain";
```

Then, inside `GroupDetailsPage`, add new state after existing state declarations:

```ts
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionFilter, setSessionFilter] = useState<"upcoming" | "active" | "past">("active");
  const [activeTab, setActiveTab] = useState<"players" | "sessions">("players");
  const [joinedSessions, setJoinedSessions] = useState<Set<string>>(new Set());
  const [groupInviteCode, setGroupInviteCode] = useState<string | null>(null);
```

In the first `useEffect` (after `getGroup`), add session watching:

```ts
    const unsubSessions = watchGroupSessions(groupId, setSessions, () => setSessions([]));
```

And add the return cleanup:
```ts
    return () => {
      unsubscribePlayers();
      unsubscribeVenues();
      unsubSessions();
    };
```

Also fetch `groupInviteCode` in the `getGroup` call:
```ts
    void getGroup(groupId).then((g) => {
      if (g) {
        setGroup(g);
        setGroupInviteCode((g as any).groupInviteCode ?? null);
      }
    });
```

Update `getGroup` return type in `groups.ts` to include `groupInviteCode`:
```ts
export async function getGroup(groupId: string): Promise<{ name: string; description: string | null; groupInviteCode?: string } | null> {
  const { db } = getFirebaseServices();
  const snap = await getDoc(doc(db, "groups", groupId));
  return snap.exists() ? (snap.data() as { name: string; description: string | null; groupInviteCode?: string }) : null;
}
```

- [ ] **Step 2: Add tab switcher and Sessions tab to the group page JSX**

In the JSX, after the hero section (`</section>`) and before the `{canManageGroup(role) && (` block, insert the tab switcher:

```tsx
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {(["players", "sessions"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              height: 38,
              padding: "0 1rem",
              border: "none",
              borderRadius: "var(--r-pill)",
              background: activeTab === tab ? "var(--ink-800)" : "var(--surface)",
              color: activeTab === tab ? "var(--volt-500)" : "var(--text-2)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {tab === "players" ? "Players" : "Sessions"}
          </button>
        ))}
      </div>
```

Wrap the existing players content (`{canManageGroup(role) && ...}`, `{canManageSessionPlayers(role) && ...}` for add player form, and the venues section) in `{activeTab === "players" && ( ... )}`.

Then add the sessions tab content after the players block:

```tsx
      {activeTab === "sessions" && (
        <section style={{ display: "grid", gap: "0.875rem" }}>
          {/* Filter chips */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["active", "upcoming", "past"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSessionFilter(f)}
                style={{
                  height: 34,
                  padding: "0 0.875rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-pill)",
                  background: sessionFilter === f ? "var(--volt-500)" : "var(--surface)",
                  color: sessionFilter === f ? "var(--ink-800)" : "var(--text-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.625rem",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {f === "active" ? "Live" : f === "upcoming" ? "Upcoming" : "Past"}
              </button>
            ))}
          </div>

          {(() => {
            const now = Date.now();
            const filtered = sessions.filter((s) => {
              const ts = s.startsAt && typeof (s.startsAt as any).toMillis === "function"
                ? (s.startsAt as any).toMillis()
                : Number(s.startsAt) || 0;
              if (sessionFilter === "active") return s.status === "active";
              if (sessionFilter === "upcoming") return s.status === "scheduled" || (s.status === "draft" && ts > now);
              return s.status === "completed" || s.status === "cancelled";
            });

            if (filtered.length === 0) {
              return (
                <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "2rem", textAlign: "center", color: "var(--text-2)" }}>
                  No {sessionFilter} sessions.
                </div>
              );
            }

            return (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {filtered.map((s) => {
                  const isOrg = s.createdBy === user?.uid;
                  const alreadyJoined = joinedSessions.has(s.id);
                  const ts = s.startsAt && typeof (s.startsAt as any).toDate === "function"
                    ? (s.startsAt as any).toDate().toLocaleDateString()
                    : "";
                  const statusTone = s.status === "active"
                    ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
                    : s.status === "completed"
                      ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                      : { bg: "var(--surface-sunken)", fg: "var(--text-3)" };

                  return (
                    <div key={s.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "0.875rem 1rem", boxShadow: "var(--shadow-xs)", display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          <span style={{ padding: "2px 7px", borderRadius: "var(--r-pill)", background: statusTone.bg, color: statusTone.fg, fontFamily: "var(--font-mono)", fontSize: "0.5625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {s.status}
                          </span>
                        </div>
                        <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                          {s.venueName} · {ts}
                        </div>
                      </div>
                      {isOrg ? (
                        <a href={`/sessions/${s.id}/live`} style={{ height: 38, padding: "0 0.875rem", borderRadius: "var(--r-lg)", background: "var(--ink-800)", color: "var(--volt-500)", fontWeight: 800, fontSize: "0.8125rem", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          Manage
                        </a>
                      ) : alreadyJoined ? (
                        <span style={{ height: 38, padding: "0 0.875rem", borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", color: "var(--text-3)", fontWeight: 800, fontSize: "0.8125rem", display: "inline-flex", alignItems: "center" }}>
                          Requested
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user || !s.joinCode) return;
                            try {
                              await requestJoin(s.joinCode, user.displayName ?? user.email ?? "Player", false);
                              setJoinedSessions((prev) => new Set([...prev, s.id]));
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          style={{ height: 38, padding: "0 0.875rem", border: "none", borderRadius: "var(--r-lg)", background: "var(--volt-500)", color: "var(--ink-800)", fontWeight: 800, fontSize: "0.8125rem", cursor: "pointer" }}
                        >
                          {s.status === "active" ? "View" : "Join"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Invite Link section (owner only) */}
          {checkCanManageGroup(role) && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1rem", boxShadow: "var(--shadow-sm)", marginTop: "0.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-display-tight)", fontSize: "1.125rem", fontWeight: 900, letterSpacing: "-0.02em", marginBottom: "0.75rem" }}>
                Group Invite Link
              </h2>
              {groupInviteCode ? (
                <div style={{ display: "grid", gap: "0.625rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "0.5rem", alignItems: "center", background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "0.625rem" }}>
                    <a
                      href={`/join/group/${groupInviteCode}`}
                      style={{ color: "var(--emerald-600)", fontWeight: 800, fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {typeof window !== "undefined" ? `${window.location.origin}/join/group/${groupInviteCode}` : `/join/group/${groupInviteCode}`}
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const origin = typeof window === "undefined" ? "" : window.location.origin;
                        await navigator.clipboard?.writeText(`${origin}/join/group/${groupInviteCode}`);
                      }}
                      style={{ width: 44, height: 44, border: "none", borderRadius: "var(--r-md)", background: "var(--ink-800)", color: "var(--volt-500)", display: "grid", placeItems: "center", cursor: "pointer" }}
                      aria-label="Copy invite link"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("Regenerate invite link? The old link will stop working.")) return;
                        const newCode = await regenerateGroupInviteCode(groupId);
                        setGroupInviteCode(newCode);
                      }}
                      style={{ height: 44, padding: "0 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", color: "var(--text-2)", fontWeight: 700, fontSize: "0.75rem", cursor: "pointer" }}
                    >
                      Regen
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>No invite code yet. Re-save this group to generate one.</p>
              )}
            </div>
          )}
        </section>
      )}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(app)/groups/[groupId]/page.tsx apps/web/src/lib/groups/groups.ts
git commit -m "feat(m8): add sessions tab and invite link section to group page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Group invite landing page `/join/group/[inviteCode]`

**Files:**
- Create: `apps/web/src/app/join/group/[inviteCode]/page.tsx`

- [ ] **Step 1: Create the directory and page**

Create `apps/web/src/app/join/group/[inviteCode]/page.tsx`:

```tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { joinGroupByInvite } from "@/lib/groups/invite";

export default function GroupInvitePage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();

  const [status, setStatus] = useState<"idle" | "joining" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) return; // Wait for user to sign in
    if (status !== "idle") return;

    setStatus("joining");
    joinGroupByInvite(inviteCode)
      .then(({ groupId }) => {
        setStatus("done");
        router.replace(`/groups/${groupId}`);
      })
      .catch((e) => {
        setStatus("error");
        setErrorMsg(e.message || "Failed to join group.");
      });
  }, [loading, user, inviteCode, status, router]);

  if (loading || status === "joining" || status === "done") {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "var(--r-md)", background: "var(--volt-500)", display: "grid", placeItems: "center", animation: "pb-pop 600ms var(--ease-out) infinite alternate" }}>
            <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
              <rect x="5" y="3" width="19" height="25" rx="9" transform="rotate(-15 14 15)" fill="none" stroke="#16241C" strokeWidth="3" />
              <circle cx="28" cy="28" r="8" fill="#16241C" />
              <circle cx="26" cy="26" r="3" fill="#C6F135" />
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            {status === "joining" || status === "done" ? "Joining group…" : "Loading…"}
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center", padding: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: "2rem", maxWidth: 400, width: "100%", textAlign: "center", display: "grid", gap: "1.25rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: "var(--r-xl)", background: "var(--volt-500)", display: "grid", placeItems: "center", margin: "0 auto" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--ink-800)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.5rem", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              You&apos;re Invited
            </h1>
            <p style={{ color: "var(--text-2)", marginTop: "0.5rem" }}>
              Sign in to join the group.
            </p>
          </div>
          <a
            href={`/sign-in?redirect=/join/group/${inviteCode}`}
            style={{ height: 50, border: "none", borderRadius: "var(--r-xl)", background: "var(--ink-800)", color: "var(--volt-500)", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1rem", textTransform: "uppercase", letterSpacing: "-0.01em", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            Sign In to Join
          </a>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "grid", placeItems: "center", padding: "1.25rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ color: "var(--danger)", fontWeight: 800, marginBottom: "1rem" }}>{errorMsg}</p>
          <a href="/dashboard" style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>Go to dashboard →</a>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/join/group/
git commit -m "feat(m8): add group invite landing page /join/group/[inviteCode]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: My Sessions section on dashboard

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add fetchMySessions and My Sessions tabs to dashboard**

In `apps/web/src/app/(app)/dashboard/page.tsx`, update imports:

```ts
import { watchUserGroups, } from "@/lib/groups/groups";
import { fetchMySessions, type SessionSummary } from "@/lib/sessions/sessions";
```

Inside `DashboardPage`, add state after existing state:

```ts
  const [mySessions, setMySessions] = useState<{ organising: SessionSummary[]; playing: SessionSummary[] } | null>(null);
  const [sessionsTab, setSessionsTab] = useState<"organising" | "playing">("organising");
```

In the `useEffect` for `user?.uid`, after `watchUserGroups`, add a `fetchMySessions` call:

```ts
  useEffect(() => {
    if (!user) return;
    void fetchMySessions(user.uid).then(setMySessions).catch(() => {});
  }, [user?.uid]);
```

Then, in the JSX, after the "Your squads" section, add a "My Sessions" section:

```tsx
      {/* My Sessions */}
      <div style={{ animation: "pb-rise 400ms 140ms var(--ease-out) both" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            My sessions
          </span>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {(["organising", "playing"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSessionsTab(tab)}
                style={{
                  height: 28,
                  padding: "0 0.625rem",
                  border: "none",
                  borderRadius: "var(--r-pill)",
                  background: sessionsTab === tab ? "var(--ink-800)" : "var(--surface)",
                  color: sessionsTab === tab ? "var(--volt-500)" : "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.5625rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {!mySessions ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--text-3)" }}>Loading…</span>
          </div>
        ) : (mySessions[sessionsTab].length === 0) ? (
          <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--r-xl)", padding: "1.5rem", textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: "0.9375rem" }}>
              {sessionsTab === "organising"
                ? "No sessions yet."
                : "You haven't joined any sessions yet."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mySessions[sessionsTab]
              .sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0))
              .map((s, i) => {
                const statusTone = s.status === "active"
                  ? { bg: "var(--volt-500)", fg: "var(--ink-800)" }
                  : s.status === "completed"
                    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                    : { bg: "var(--surface-sunken)", fg: "var(--text-3)" };
                const ts = s.startsAt && typeof (s.startsAt as any).toDate === "function"
                  ? (s.startsAt as any).toDate().toLocaleDateString()
                  : "";
                const href = sessionsTab === "organising"
                  ? `/sessions/${s.id}/live`
                  : `/sessions/${s.id}/player`;
                return (
                  <a
                    key={s.id}
                    href={href}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      gap: "0.75rem",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-xl)",
                      padding: "0.875rem 1rem",
                      textDecoration: "none",
                      boxShadow: "var(--shadow-sm)",
                      animation: `pb-rise 400ms ${140 + i * 30}ms var(--ease-out) both`,
                    }}
                  >
                    <span style={{ padding: "2px 7px", borderRadius: "var(--r-pill)", background: statusTone.bg, color: statusTone.fg, fontFamily: "var(--font-mono)", fontSize: "0.5625rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {s.status}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-1)" }}>{s.name}</div>
                      {ts && <div style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>{s.venueName} · {ts}</div>}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                );
              })}
          </div>
        )}
      </div>
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @picklebaddies/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(app)/dashboard/page.tsx
git commit -m "feat(m8): add My Sessions section to dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Final typecheck + build verification

**Files:** none (verification only)

- [ ] **Step 1: Run all typechecks**

```bash
pnpm -r typecheck
```

Expected: no errors across all packages.

- [ ] **Step 2: Run unit tests**

```bash
pnpm -r test
```

Expected: all tests pass.

- [ ] **Step 3: Run a production build of the web app**

```bash
pnpm --filter @picklebaddies/web build
```

Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(m8): court-link scoring + group discovery — complete

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Manual QA Checklist

After all tasks are done, verify these flows on a mobile browser with emulators running (`pnpm emulators` + `pnpm dev:web`):

1. **Score link (court-captain flow)**
   - Create a session → start it → generate matches → open `/sessions/[id]`
   - Copy the Score Link URL → open in a private/incognito window (no sign-in)
   - Verify court cards show current match with player names
   - Submit a winner on a court → confirm match locks, leaderboard updates live
   - Toggle "Allow court link scoring" off → reload score link → confirm "Scoring not available" state

2. **Group discovery flow**
   - Open `/groups/[id]` as owner → Sessions tab → Invite Link section shows link + copy + regen
   - Copy invite link → open in incognito → confirm "Sign in to join" prompt
   - Sign in → confirm redirect back → confirm added as member
   - As new member → Sessions tab shows group sessions → tap "Join" → confirm request appears in organiser's join queue

3. **My Sessions dashboard**
   - Sign in as organiser → dashboard shows sessions under "Organising" tab
   - Sign in as a player who joined a session → "Playing" tab shows that session
