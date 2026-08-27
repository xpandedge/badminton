# RSVP Auto Session Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the pre-start session player roster aligned with confirmed RSVP changes so organisers can schedule confirmed players without manually adding them.

**Architecture:** Build a shared pure roster-update planner from the existing RSVP bucket rules, then apply its active/waiting/left updates inside the existing Firestore transactions. Use it from public RSVP mutations and the signed-in RSVP mutation, while leaving active and paused sessions unchanged and preserving manually added players that are not represented by the changed RSVP roster.

**Tech Stack:** Next.js server actions, Firebase Admin Firestore transactions, TypeScript, Vitest, `@picklebaddies/domain` RSVP bucket helpers.

## Global Constraints

- Only `draft` and `scheduled` sessions may be changed automatically by RSVP mutations.
- Confirmed RSVP entries use session-player status `active`; waiting casuals must not be schedulable.
- RSVP “No” marks an existing session player `left` instead of deleting historical data.
- Current matches and active/paused sessions must remain unchanged.
- Preserve existing player statistics when reactivating a session player.
- Keep the existing `Sync confirmed roster` action as a repair/backfill path.

---

### Task 1: Build the RSVP session-player update planner

**Files:**
- Create: `apps/web/src/server/sessions/rsvp-session-players.ts`
- Test: `apps/web/src/server/sessions/rsvp-session-players.test.ts`

**Interfaces:**
- Consumes raw group-player, RSVP, and session-player records plus one changed RSVP response.
- Produces deterministic update plans for confirmed active players, existing waiting players, and the changed player when they are away/removed.

- [ ] **Step 1: Write the failing tests**

```ts
it("activates confirmed regulars and leaves an explicit-away player out", () => {
  const plan = planRsvpSessionPlayerUpdates({
    status: "scheduled",
    capacity: { totalPlayers: 6, casualConfirmedSlots: 2, waitlistEnabled: true },
    groupPlayers: [regular("regular-1", "Alex"), regular("regular-2", "Bea")],
    rsvps: [{ id: "regular-1", response: "away" }],
    sessionPlayers: [{ id: "regular-1", playerId: "regular-1", status: "active" }],
    changedRsvp: { playerId: "regular-1", response: "away" },
  });

  expect(plan.active).toEqual(expect.arrayContaining([
    expect.objectContaining({ playerId: "regular-2", status: "active" }),
  ]));
  expect(plan.leftPlayerIds).toEqual(["regular-1"]);
});

it("keeps a waiting casual out of active players and promotes the first confirmed casual", () => {
  const plan = planRsvpSessionPlayerUpdates({
    status: "scheduled",
    capacity: { totalPlayers: 3, casualConfirmedSlots: 1, waitlistEnabled: true },
    groupPlayers: [regular("regular-1", "Alex")],
    rsvps: [
      { id: "guest-a", response: "casual_joined", participantType: "public_casual", displayName: "Casey", createdAtMs: 1 },
      { id: "guest-b", response: "casual_joined", participantType: "public_casual", displayName: "Drew", createdAtMs: 2 },
    ],
    sessionPlayers: [{ id: "guest-b", playerId: "guest-b", status: "active" }],
    changedRsvp: { playerId: "guest-a", response: "casual_joined" },
  });

  expect(plan.active.map((entry) => entry.playerId)).toContain("guest-a");
  expect(plan.waitingPlayerIds).toContain("guest-b");
});

it("does not produce automatic roster updates for active or paused sessions", () => {
  expect(planRsvpSessionPlayerUpdates({
    status: "active",
    capacity: { totalPlayers: 4, casualConfirmedSlots: 1, waitlistEnabled: true },
    groupPlayers: [regular("regular-1", "Alex")],
    rsvps: [],
    sessionPlayers: [],
    changedRsvp: { playerId: "regular-1", response: "in" },
  })).toEqual({ active: [], waitingPlayerIds: [], leftPlayerIds: [] });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run src/server/sessions/rsvp-session-players.test.ts`

Expected: FAIL because `planRsvpSessionPlayerUpdates` does not exist yet.

- [ ] **Step 3: Implement the pure planner**

Implement `planRsvpSessionPlayerUpdates(input)` using `buildSessionRsvpBuckets` from `@picklebaddies/domain`:

```ts
export interface RsvpSessionPlayerPlanEntry {
  playerId: string;
  displayName: string;
  skillLevel: string;
  participantType: "registered_user" | "guest";
  status: "active";
}

export interface RsvpSessionPlayerUpdatePlan {
  active: RsvpSessionPlayerPlanEntry[];
  waitingPlayerIds: string[];
  leftPlayerIds: string[];
}
```

Build regular and casual entries from group players and public-casual RSVP records, apply `changedRsvp` over the matching RSVP ID, pass them through the existing capacity bucket function, put confirmed entries in `active`, put only already-existing waiting session-player IDs in `waitingPlayerIds`, and put the changed player in `leftPlayerIds` for `away` or `removed`. Return empty arrays when `status` is `active` or `paused`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm exec vitest run src/server/sessions/rsvp-session-players.test.ts`

Expected: PASS for all planner cases.

- [ ] **Step 5: Commit the planner and tests**

```bash
git add apps/web/src/server/sessions/rsvp-session-players.ts apps/web/src/server/sessions/rsvp-session-players.test.ts
git commit -m "Add pre-session RSVP roster planner"
```

### Task 2: Apply planner updates to RSVP mutations

**Files:**
- Modify: `apps/web/src/server/sessions/rsvp-public.ts:160-284`
- Modify: `apps/web/src/server/sessions/actions.ts:698-855`
- Test: `apps/web/src/server/sessions/rsvp-public.test.ts`

**Interfaces:**
- Consumes `RsvpSessionPlayerUpdatePlan` from Task 1.
- Produces atomic RSVP and session-player updates for public and signed-in RSVP actions.

- [ ] **Step 1: Add transaction test coverage for public RSVP paths**

Mock the Admin DB and transaction reads, then verify:

```ts
await joinKnownPlayerRsvp("ABC123", "regular-1");
expect(transaction.set).toHaveBeenCalledWith(
  expect.objectContaining({ path: "sessions/session-1/players/regular-1" }),
  expect.objectContaining({ status: "active" }),
  { merge: true },
);

await removeKnownPlayerRsvp("ABC123", "regular-1");
expect(transaction.update).toHaveBeenCalledWith(
  expect.objectContaining({ path: "sessions/session-1/players/regular-1" }),
  expect.objectContaining({ status: "left" }),
);
```

Also cover a public casual guest becoming active, a waiting guest not being added as active, and active/paused sessions receiving no session-player write.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `pnpm exec vitest run src/server/sessions/rsvp-public.test.ts`

Expected: FAIL because the current public mutations write only `sessions/{id}/rsvps`.

- [ ] **Step 3: Integrate the planner into `rsvp-public.ts` transactions**

For `updateKnownPlayerRsvp` and `joinPublicCasualRsvp`, read the fresh session, group players, all RSVPs, and session players before writing. Write the RSVP mutation, calculate the plan with the changed response, and apply:

```ts
for (const entry of plan.active) {
  t.set(db.doc(`sessions/${sessionId}/players/${entry.playerId}`), {
    playerId: entry.playerId,
    displayName: entry.displayName,
    skillLevel: entry.skillLevel,
    status: entry.status,
    participantType: entry.participantType,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

for (const playerId of plan.waitingPlayerIds) {
  t.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
    status: "waiting",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

for (const playerId of plan.leftPlayerIds) {
  t.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
    status: "left",
    leftAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
```

Use the same transaction shape for `removePublicCasualRsvp`, including a session-player update when the guest has already been added. Do not write session players when the fresh session status is active or paused.

- [ ] **Step 4: Make signed-in RSVP use the same pre-start roster rules**

In `rsvpToSession`, replace the unconditional casual activation with the planner result so a casual at capacity becomes `waiting`, and apply the active/waiting/left plan inside the existing transaction. Preserve the existing signed-in membership validation and session counters.

- [ ] **Step 5: Run focused tests and verify they pass**

Run: `pnpm exec vitest run src/server/sessions/rsvp-session-players.test.ts src/server/sessions/rsvp-public.test.ts`

Expected: PASS, including active/paused protection and existing stats preservation through `{ merge: true }`.

- [ ] **Step 6: Commit the RSVP integration**

```bash
git add apps/web/src/server/sessions/rsvp-public.ts apps/web/src/server/sessions/actions.ts apps/web/src/server/sessions/rsvp-public.test.ts
git commit -m "Sync pre-session players from RSVP changes"
```

### Task 3: Add the pre-start active-player remove control

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx:1097-1115`

**Interfaces:**
- Consumes the existing `activePlayers`, `isLive`, `canManageLive`, and `handlePlayerStatus` values.
- Produces an admin-only `x` control within each active-player chip for draft and scheduled sessions.

- [ ] **Step 1: Add the control beside each active-player name**

Render the existing chip as a flex container and include a compact icon button when `canManageLive && !isLive`:

```tsx
{activePlayers.map((player) => (
  <span key={player.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.55rem 0.45rem 0.7rem", borderRadius: "var(--r-pill)", background: "var(--surface-sunken)", border: "1px solid var(--border)", fontWeight: 800, fontSize: "0.8125rem" }}>
    {player.displayName}
    {canManageLive && !isLive && (
      <button
        type="button"
        aria-label={`Remove ${player.displayName} from this session`}
        title="Remove from session"
        onClick={() => handlePlayerStatus(player.id, "removed")}
        style={{ width: 24, height: 24, display: "inline-grid", placeItems: "center", padding: 0, border: 0, borderRadius: "50%", background: "transparent", color: "var(--danger)", fontSize: "1.1rem", lineHeight: 1, cursor: "pointer" }}
      >
        &times;
      </button>
    )}
  </span>
))}
```

Keep the existing lower `Remove` action for the full roster-management view. The chip control must not call rebalance for a pre-start session because no current matches exist yet.

- [ ] **Step 2: Verify the UI typechecks**

Run: `$env:CI='true'; pnpm run typecheck` from `apps/web`.

Expected: PASS with the new button and callback types.

- [ ] **Step 3: Commit the UI control**

```bash
git add apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx
git commit -m "Add quick pre-session player removal"
```

### Task 4: Validate the complete web application

**Files:**
- Verify: `apps/web/src/server/sessions/rsvp-session-players.ts`
- Verify: `apps/web/src/server/sessions/rsvp-public.ts`
- Verify: `apps/web/src/server/sessions/actions.ts`
- Verify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

- [ ] **Step 1: Run the complete web unit-test suite**

Run: `$env:CI='true'; pnpm exec vitest run` from `apps/web`.

Expected: all existing and new unit tests pass.

- [ ] **Step 2: Run the web TypeScript check**

Run: `$env:CI='true'; pnpm run typecheck` from `apps/web`.

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 3: Review the final diff and worktree**

Run: `git diff --check; git status --short --branch`

Expected: no whitespace errors and only the intended commits/files are present.

- [ ] **Step 4: Push `main` and deploy production**

```bash
git push origin main
node "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" vercel deploy --prod -y --scope xpandedge-6820s-projects
```

Wait for Vercel `READY`, confirm the deployment aliases `duorally.com.au`, and report the deployment ID and production URL.
