# Leave Squad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe ownership transfer and self-service Leave squad flows.

**Architecture:** Add a pure leave predicate, authenticated server actions for ownership transfer and self-removal, and squad-page actions using the existing in-app confirmation dialog. Leaving removes draft/scheduled participation in one transaction and clears any generated-but-unstarted schedule; active and historical session records remain unchanged.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin Firestore, Vitest

## Global Constraints

- Members, admins, and legacy organisers may leave their own squad.
- Owners transfer ownership to another registered member before leaving.
- The previous owner becomes an admin after transfer.
- Preserve active, paused, completed, and cancelled session records.
- Preserve completed scores and global rankings.
- Use the existing app-native confirmation dialog.

---

### Task 1: Define Leave Permission

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Modify: `packages/domain/src/roles.test.ts`

**Interfaces:**
- Produces: `canLeaveGroup(role: GroupRole | null): boolean`

- [ ] **Step 1: Add failing permission tests**

Assert that member, admin, and organiser return true, while owner and null return false.

- [ ] **Step 2: Implement the predicate**

Return true only for a non-owner stored group role.

- [ ] **Step 3: Run role tests**

Run: `apps\web\node_modules\.bin\vitest.cmd run packages/domain/src/roles.test.ts` from the repository root, or the equivalent package-local Vitest command.

Expected: all role tests pass.

### Task 2: Add the Server Action

**Files:**
- Modify: `apps/web/src/server/squads/actions.ts`

**Interfaces:**
- Consumes: `canLeaveGroup(role)`
- Produces: `leaveSquad(squadId: string): Promise<ActionResult<void>>`
- Produces: `transferSquadOwnership(squadId: string, targetUserId: string): Promise<ActionResult<void>>`

- [ ] **Step 1: Validate the caller**

Require authentication and verify that the caller is a member/admin rather than the owner.

- [ ] **Step 2: Remove future participation**

For draft and scheduled sessions, delete the caller's player, leaderboard, and RSVP documents and adjust RSVP counters from their previous response. Clear generated matches, sit-outs, and engine state when the session has not started so the schedule can be rebuilt without the departing player.

- [ ] **Step 3: Remove squad membership**

Delete the caller's member and squad-player documents and remove their UID from the group's `memberIds` array.

- [ ] **Step 4: Transfer ownership atomically**

Require the caller to be the current owner and the target to be a registered non-owner member. Promote the target to owner, demote the caller to admin, and update the group's `createdBy` field in one transaction.

### Task 3: Add the Squad Page Action

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- Modify: `apps/web/src/app/(app)/help/page.tsx`

**Interfaces:**
- Consumes: `leaveSquad(squadId)`
- Produces: Leave squad confirmation, success navigation, owner guidance, and Help copy

- [ ] **Step 1: Add Leave squad UI**

Show a danger-outline action in the Members view for admins and members. Confirm with the existing app dialog, call the action, then return Home.

- [ ] **Step 2: Add ownership transfer**

Let the owner transfer ownership from a registered member row. Confirm that the selected member becomes owner and the current owner becomes admin.

- [ ] **Step 3: Update Help**

Explain where members leave, what history remains, and that owners transfer ownership first.

### Task 4: Verify and Deploy

**Files:**
- Verify all modified files

**Interfaces:**
- Produces: production release at `https://duorally.com.au`

- [ ] **Step 1: Run focused tests and TypeScript**

Run the domain role tests and `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`.

- [ ] **Step 2: Run whitespace checks**

Run `git diff --check` and accept only existing CRLF conversion warnings.

- [ ] **Step 3: Deploy production**

Run `npx.cmd vercel deploy --prod -y` and verify READY plus the `duorally.com.au` alias.
