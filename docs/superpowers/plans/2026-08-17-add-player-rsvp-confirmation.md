# Add Player RSVP Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark a squad player as RSVP confirmed when an organiser/admin adds them to a session.

**Architecture:** Keep the UI unchanged and update the shared `addGroupMemberToSession` server action. The action already powers self-add, admin Add, and Add all, so it can write the RSVP document and adjust session RSVP counters in the same Firestore transaction that creates the session player.

**Tech Stack:** Next.js App Router server actions, Firebase Admin Firestore transactions, TypeScript.

## Global Constraints

- Do not add a new RSVP admin panel for this behavior.
- Add means confirmed for this session.
- Regular players use RSVP response `in`.
- Casual players use RSVP response `casual_joined`.
- Removing a player from a session must not automatically mark them away.
- Preserve existing duplicate-player behavior.

---

### Task 1: Confirm RSVP on Session Add

**Files:**
- Modify: `apps/web/src/server/sessions/players.ts`

**Interfaces:**
- Consumes: `addGroupMemberToSession(sessionId: string, targetPlayerId: string): Promise<ActionResult<void>>`
- Produces: same signature, with additional Firestore writes to `sessions/{sessionId}/rsvps/{targetPlayerId}` and adjusted `sessions/{sessionId}.rsvpGoingCount` / `rsvpNotGoingCount`.

- [x] **Step 1: Read the existing add transaction**

Confirm `addGroupMemberToSession` already fetches:
```ts
const sessionRef = db.doc(`sessions/${sessionId}`);
const sessionSnap = await t.get(sessionRef);
const groupPlayerSnap = await t.get(db.doc(`groups/${session.groupId}/players/${targetPlayerId}`));
```

- [x] **Step 2: Fetch existing RSVP doc inside the transaction**

Add:
```ts
const rsvpRef = db.doc(`sessions/${sessionId}/rsvps/${targetPlayerId}`);
const existingRsvp = await t.get(rsvpRef);
```

- [x] **Step 3: Derive RSVP response from player type**

Add after `groupPlayer` is available:
```ts
const playerKind = groupPlayer.playerKind === "casual" ? "casual" : "regular";
const rsvpResponse = playerKind === "casual" ? "casual_joined" : "in";
```

- [x] **Step 4: Write RSVP confirmation**

Write the RSVP doc in the same transaction:
```ts
t.set(rsvpRef, {
  userId: groupPlayer.userId ?? targetPlayerId,
  displayName,
  status: "going",
  response: rsvpResponse,
  playerKind,
  participantType: "registered_user",
  adminOverride: "confirmed",
  adminOverrideBy: user.uid,
  createdAt: existingRsvp.exists ? existingRsvp.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });
```

- [x] **Step 5: Adjust RSVP counters only for status changes**

Use existing status to avoid double counting:
```ts
const previousStatus = existingRsvp.exists ? existingRsvp.data()?.status : null;
if (previousStatus !== "going") {
  const previousGoing = Number(session.rsvpGoingCount ?? 0);
  const previousAway = Number(session.rsvpNotGoingCount ?? 0);
  t.set(sessionRef, {
    rsvpGoingCount: previousGoing + 1,
    rsvpNotGoingCount: previousStatus === "not_going" ? Math.max(0, previousAway - 1) : previousAway,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
```

- [x] **Step 6: Include RSVP detail in audit log**

Extend the existing audit details:
```ts
details: { playerId: targetPlayerId, displayName, rsvpResponse, playerKind }
```

- [x] **Step 7: Verify TypeScript**

Run:
```powershell
node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit
```

Expected: command exits `0`.

- [ ] **Step 8: Manual behavior check**

Use an upcoming session. Add one regular and one casual from the existing Add list. Confirm they appear in "In this session" and the RSVP roster treats them as confirmed.

Status: Not run in this pass because no specific test session was opened interactively.
