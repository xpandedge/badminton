# RSVP Identity Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let regulars RSVP yes/no from the shared RSVP page, let known casuals join by selecting their signed-up profile, and keep unknown guest names session-only until admin approval.

**Architecture:** Keep RSVP bucketing in `packages/domain`. Use `apps/web/src/server/sessions/rsvp-public.ts` for public-link actions and viewer-aware page data. Keep admin approval in `apps/web/src/server/sessions/actions.ts`, with approved public guests syncing only into `sessions/{id}/players`, not squad/group player profiles.

**Tech Stack:** Next.js App Router server components/actions, Firebase Admin Firestore, TypeScript, Vitest domain tests.

## Global Constraints

- Unknown public guest names are session-only and must not create group/player profiles.
- Regular players are signed-in members and default to `in` unless they mark `away`.
- Known casuals are existing signed-up squad/app players selected from the RSVP form.
- Keep visible copy user-friendly; preserve internal `/groups` identifiers.
- Do not change live-session scheduling or scoring behavior in this feature.

---

### Task 1: Extend RSVP Domain State

**Files:**
- Modify: `packages/domain/src/session-rsvp.ts`
- Modify: `packages/domain/src/session-rsvp.test.ts`

**Interfaces:**
- Consumes: existing `RsvpResponse`, `buildSessionRsvpBuckets`.
- Produces: `RsvpResponse` includes `"guest_requested"`; bucket logic excludes requests from confirmed/waiting casuals.

- [ ] **Step 1: Add a failing test**

```ts
it("keeps guest requests out of confirmed and waiting casual buckets", () => {
  const result = buildSessionRsvpBuckets({
    capacity: { totalPlayers: 8, casualConfirmedSlots: 2, waitlistEnabled: true },
    regulars: [{ id: "r1", displayName: "Regular 1" }],
    casuals: [
      { id: "g1", displayName: "Guest One", response: "guest_requested", joinedAtMs: 1 },
      { id: "c1", displayName: "Known Casual", response: "casual_joined", joinedAtMs: 2 },
    ],
  });

  expect(result.casualsConfirmed.map((entry) => entry.displayName)).toEqual(["Known Casual"]);
  expect(result.casualsWaiting).toEqual([]);
});
```

- [ ] **Step 2: Implement the type change**

```ts
export type RsvpResponse = "in" | "away" | "casual_joined" | "guest_requested" | "removed";
```

- [ ] **Step 3: Run domain tests**

Run: `.\node_modules\.bin\vitest.CMD run src\session-rsvp.test.ts` from `packages/domain`.

### Task 2: Public RSVP Server Actions

**Files:**
- Modify: `apps/web/src/server/sessions/rsvp-public.ts`

**Interfaces:**
- Produces: `PublicRsvpRoster.viewer`, `knownCasualOptions`, `guestRequests`.
- Produces actions: `rsvpViewerFromPublicLink`, `joinKnownCasualRsvp`, `requestPublicGuestRsvp`.

- [ ] **Step 1: Add viewer data**

Use `verifySession()` to detect a signed-in regular/casual member for the linked session. Return their display name, player kind, and current RSVP response.

- [ ] **Step 2: Add known casual options**

Return group players where `playerKind === "casual"`, excluding removed or duplicate entries.

- [ ] **Step 3: Change typed public names into requests**

Write public guest docs as:

```ts
{
  participantType: "public_casual",
  response: "guest_requested",
  status: "pending",
}
```

- [ ] **Step 4: Add known casual join action**

Validate the selected player ID belongs to the RSVP session's group and has `playerKind === "casual"`, then write `response: "casual_joined"` to `sessions/{id}/rsvps/{playerDocId}`.

### Task 3: Public RSVP Page UI

**Files:**
- Modify: `apps/web/src/app/rsvp/[rsvpCode]/page.tsx`

**Interfaces:**
- Consumes: new roster data and actions from `rsvp-public.ts`.

- [ ] **Step 1: Add regular controls**

If `roster.viewer?.playerKind === "regular"`, render `I'm in` and `I'm away` forms.

- [ ] **Step 2: Add known casual dropdown**

Render a select of `knownCasualOptions` that submits to `joinKnownCasualRsvp`.

- [ ] **Step 3: Add guest request copy**

Rename typed-name form to `Request a guest spot` and explain it is for this session only.

### Task 4: Admin Guest Approval

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`

**Interfaces:**
- Produces: `SessionRsvpAdminRoster.guestRequests`.
- Produces action: `approveGuestRsvp(sessionId, rsvpId)`.

- [ ] **Step 1: Surface guest requests**

Read public RSVP docs with `response === "guest_requested"` into a new admin bucket.

- [ ] **Step 2: Approve session-only guest**

Admin approval sets the request to `response: "casual_joined"`, `adminOverride: "confirmed"`, and keeps `participantType: "public_casual"`.

- [ ] **Step 3: Render admin review**

Show `Guest requests` with `Approve for this session` and `Remove`.

### Task 5: Verification

**Files:**
- No source edits.

- [ ] **Step 1: Run domain tests**

Run: `.\node_modules\.bin\vitest.CMD run src\session-rsvp.test.ts` from `packages/domain`.

- [ ] **Step 2: Run web typecheck**

Run: `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`.
