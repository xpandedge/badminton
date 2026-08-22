# RSVP Casual Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public RSVP page simple while nudging signed-up casuals to select their existing profile before adding a session-only guest name.

**Architecture:** Extend the public RSVP server action to expose signed-up casual options and handle selected casual join/remove by player ID. Keep typed guest names as session-only public casual RSVPs, with exact duplicate blocking against existing squad player names. Keep invite-code joins defaulted to regular; let admins approve requested members as regular or casual.

**Tech Stack:** Next.js App Router, React server actions, Firebase Admin Firestore, TypeScript.

## Global Constraints

- Invite-code joins create regular players.
- Request-to-join approvals let admin choose regular or casual.
- Regulars are in by default and do not use the public casual form.
- Signed-up casual RSVP copy is "I'm interested" / "Not interested".
- Guest typed names are session-only and should be blocked on exact normalized matches with known signed-up squad players.

---

### Task 1: Public RSVP Known Casual Picker

**Files:**
- Modify: `apps/web/src/server/sessions/rsvp-public.ts`
- Modify: `apps/web/src/app/rsvp/[rsvpCode]/page.tsx`

**Interfaces:**
- `PublicRsvpRoster.knownCasualOptions: Array<{ playerId: string; displayName: string }>`
- `joinKnownCasualRsvp(rsvpCode: string, playerId: string): Promise<ActionResult<void>>`
- `removeKnownCasualRsvp(rsvpCode: string, playerId: string): Promise<ActionResult<void>>`

Status: Complete.

### Task 2: Admin Request Approval Type

**Files:**
- Modify: `apps/web/src/server/squads/actions.ts`
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- `approveJoinRequest(squadId: string, requesterId: string, kind?: SquadPlayerKind)`

Status: Complete.

### Task 3: Casual RSVP Copy

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Behavior:**
- For casual players, use "I'm interested" and "Not interested".
- Keep regular copy as "I'm in" / "I'm away".

Status: Complete.

### Task 4: Verification

Run:
- `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`
- `node_modules\.bin\tsc.cmd -p packages\domain\tsconfig.json --noEmit`

Status: Complete.
