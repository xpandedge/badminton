# Squad Archive Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a squad owner archive a squad immediately, restore it for two days, and then permanently remove the squad-owned data and its top-level sessions without deleting global player identities or cross-squad statistics.

**Architecture:** Store archive metadata on `groups/{squadId}`, keep membership during the two-day read-only window so the owner can restore, and hide archived squads from normal discovery/list surfaces. A shared pure retention policy defines the two-day deadline. Server actions and Firestore rules reject writes while archived. A single daily scheduled function claims expired squads and recursively deletes nested group data plus top-level sessions linked by `groupId`.

**Tech Stack:** TypeScript, Next.js server actions, Firebase Admin Firestore, Firebase Functions v2 scheduler, Firestore Security Rules, Vitest, pnpm workspaces.

## Global Constraints

- Only the current `owner` role may archive or restore a squad; admins and members must receive `FORBIDDEN`.
- Archive is immediate and reversible for exactly the retained window; it must not remove `memberIds`, membership documents, or session documents before expiry.
- Archived squads are read-only: no new members, join requests, venues, players, sessions, RSVPs, scores, scheduling, or administration writes.
- The owner confirmation must state that the squad becomes unavailable immediately and that all squad data and sessions are permanently deleted after two days.
- Purge must be idempotent, bounded per scheduled invocation, and safe to retry after a partial failure.
- Delete `groups/{squadId}` and all nested subcollections, plus every top-level `sessions` document whose `groupId` matches. Preserve `users/{uid}` and global `players/{uid}`.
- Do not add a per-squad timer. Use one daily scheduled cleanup function so the feature does not create unbounded scheduled resources.
- Keep `docs/superpowers/plans/2026-08-22-squad-archive-delete.md` in `docs/superpowers/plans/` until every task is implemented, verified, and accepted.

---

## File Structure

- `packages/domain/src/squad-archive.ts` owns the pure two-day policy and timestamp parsing.
- `packages/domain/src/squad-archive.test.ts` owns policy tests.
- `apps/web/src/server/squads/actions.ts` owns owner authorization, archive/restore actions, and the active-squad guard used by squad mutations.
- `apps/web/src/server/sessions/actions.ts`, `generate.ts`, `rebalance.ts`, `players.ts`, `score.ts`, `score-link.ts`, and `rsvp-public.ts` own the active-squad checks for session mutations and public RSVP/score entry points.
- `apps/web/src/lib/groups/groups.ts` owns client group metadata and normal-list filtering.
- `apps/web/src/app/(app)/groups/[groupId]/page.tsx` owns the read-only archived view, confirmation flow, and restore control.
- `functions/src/purgeArchivedSquads.ts` owns the scheduled trigger and an emulator-testable purge helper.
- `functions/src/index.ts` exports the scheduled function.
- `firestore.rules` prevents direct client writes to archive metadata and blocks writes below archived groups.
- `apps/web/firestore.groups.rules.test.ts` and `apps/web/firestore.sessions.rules.test.ts`, plus `functions/src/__tests__/squadArchive.test.ts`, cover the security and cleanup boundaries.

## Task 1: Add the Shared Archive Policy

**Files:**
- Create: `packages/domain/src/squad-archive.ts`
- Create: `packages/domain/src/squad-archive.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Export `SQUAD_ARCHIVE_RETENTION_MS` equal to exactly `2 * 24 * 60 * 60 * 1000`.
- Export `getSquadPurgeAfter(nowMs?: number): number`.
- Export `getTimestampMillis(value: unknown): number | null` for Firestore `Timestamp`, `Date`, number, and parseable string values.
- Export `isSquadArchived(data: { archivedAt?: unknown }): boolean`.
- Export `isSquadPurgeDue(data: { purgeAfter?: unknown }, nowMs?: number): boolean`.

- [ ] **Step 1: Add failing policy tests**

  Cover the exact two-day deadline, Firestore-like timestamp objects with `toMillis`, invalid/missing timestamps, archived detection, and due/not-due boundaries.

- [ ] **Step 2: Run the focused domain test and confirm it fails**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test -- src/squad-archive.test.ts`

- [ ] **Step 3: Implement the pure policy and export it**

  Keep the module dependency-free and avoid Firebase imports. Build the domain package before consumers use the new export.

- [ ] **Step 4: Run focused tests and typecheck**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain test`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain typecheck`

## Task 2: Implement Owner Archive and Restore Actions

**Files:**
- Modify: `apps/web/src/server/squads/actions.ts`
- Modify: `apps/web/src/server/squads/types.ts`
- Create: `apps/web/src/server/squads/archive.test.ts`

**Interfaces:**
- Add `archiveSquad(squadId: string): Promise<ActionResult<{ purgeAfter: number }>>`.
- Add `restoreSquad(squadId: string): Promise<ActionResult<void>>`.
- Add a server-only `requireActiveSquad(...)`/equivalent helper that reads both the group document and caller membership, returns the role plus group data, and rejects an archived group with `FAILED_PRECONDITION`.
- Extend the group storage type with optional `archivedAt`, `purgeAfter`, and `archivedBy` fields without changing existing active group creation behavior.

- [ ] **Step 1: Add action tests for authorization and state transitions**

  Mock the existing auth and Admin Firestore seams used by squad actions. Cover owner archive success, non-owner rejection, missing squad, already archived rejection, metadata values, restore by the original/current owner, restore after expiry rejection, and restore after ownership transfer only when the current membership role is owner.

- [ ] **Step 2: Run the focused test and confirm it fails**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/squads/archive.test.ts`

- [ ] **Step 3: Implement archive as one authoritative server update**

  Re-read the group and caller membership, require `owner`, reject an archived group, write `archivedAt: FieldValue.serverTimestamp()`, `purgeAfter: Timestamp.fromMillis(Date.now() + SQUAD_ARCHIVE_RETENTION_MS)`, `archivedBy: session.uid`, and audit metadata. Return the numeric purge deadline for the UI.

- [ ] **Step 4: Implement restore with an expiry check**

  Re-read the group and current caller role, require `owner`, require a future `purgeAfter`, and clear the three archive fields with `FieldValue.delete()` while updating audit metadata. Do not recreate deleted data and make repeated restore calls return a clear precondition error.

- [ ] **Step 5: Add active-squad checks to every squad mutation**

  Apply the helper to member add/join/request/approval/rejection, guest/player changes, invite rotation, RSVP-default changes, venue/court management, role changes, ownership transfer, member removal, and leave. Keep read paths available during the archive window.

- [ ] **Step 6: Run focused tests and web typecheck**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web exec vitest run src/server/squads/archive.test.ts`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck`

## Task 3: Lock Session and Direct Firestore Writes While Archived

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/server/sessions/generate.ts`
- Modify: `apps/web/src/server/sessions/rebalance.ts`
- Modify: `apps/web/src/server/sessions/players.ts`
- Modify: `apps/web/src/server/sessions/score.ts`
- Modify: `apps/web/src/server/sessions/score-link.ts`
- Modify: `apps/web/src/server/sessions/rsvp-public.ts`
- Modify: `firestore.rules`
- Modify: `apps/web/firestore.groups.rules.test.ts`
- Modify: `apps/web/firestore.sessions.rules.test.ts`

**Interfaces:**
- Reuse one server guard that accepts a `groupId` and throws/returns `FAILED_PRECONDITION` for archived squads.
- Preserve `getGroupSessionsAction`, group session reads, score-link reads, and archived owner history reads during the retention window.

- [ ] **Step 1: Add regression tests for archived mutation rejection**

  Cover session creation, lifecycle changes, RSVP, player changes, generation/rebalance, score entry, public RSVP/score links, and direct client writes under an archived group. Cover that reads still succeed during the window.

- [ ] **Step 2: Run the focused tests and confirm the new cases fail**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test`

  For rules only, use the existing `test:rules` command when a JDK is available; otherwise leave the rules cases for CI as documented in `CLAUDE.md`.

- [ ] **Step 3: Add server guards at the group boundary**

  In each mutating server entry point, load the session's `groupId` where necessary, verify the group is active, then perform the existing role and state checks. Do not change score/stat semantics for active squads.

- [ ] **Step 4: Tighten Firestore rules**

  Add an `isGroupActive(groupId)` helper and require it for client writes to group subcollections and session create/update subcollections. Keep group document updates allowed for normal owner fields but require `archivedAt`, `purgeAfter`, and `archivedBy` to remain unchanged, forcing archive/restore through the server actions.

- [ ] **Step 5: Run web typecheck and the non-rules unit suite**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test`

## Task 4: Add Scheduled Recursive Purge

**Files:**
- Create: `functions/src/purgeArchivedSquads.ts`
- Modify: `functions/src/index.ts`
- Create: `functions/src/__tests__/squadArchive.test.ts`

**Interfaces:**
- Export a scheduler `purgeArchivedSquads` using Firebase Functions v2 `onSchedule` in `australia-southeast1`.
- Export an emulator-testable `purgeExpiredArchivedSquads(db, nowMs?, limit?)` helper returning `{ scanned: number; purged: number }`.

- [ ] **Step 1: Add cleanup tests first**

  Seed an expired archived group with members, players, venues/courts, join requests, audit logs, and multiple top-level sessions with nested players, matches, sit-outs, RSVPs, engine state, leaderboards, and audit logs. Also seed a live group, a non-expired archived group, global player docs, and user docs. Assert only the expired squad-owned data disappears.

- [ ] **Step 2: Add retry and boundary tests**

  Assert the non-expired group remains, a missing/partial nested collection is harmless, a second purge run returns zero additional purges, and an expired group rechecked immediately before deletion is skipped if restored.

- [ ] **Step 3: Run the focused function tests and confirm they fail**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/functions exec vitest run src/__tests__/squadArchive.test.ts`

- [ ] **Step 4: Implement bounded recursive deletion**

  Query archived groups with `purgeAfter <= now`, limit each invocation to a small fixed batch, re-read each candidate and verify it is still archived and due, query top-level sessions by `groupId`, recursively delete each session, then recursively delete the group document and all nested subcollections. Log identifiers and counts without logging user credentials or private data.

- [ ] **Step 5: Register the daily scheduler and build functions**

  Configure one daily schedule with the existing region/global options. Export it from `functions/src/index.ts`, preserving all existing callable exports.

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/functions typecheck`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/functions build`

## Task 5: Add Archived Squad UI and Normal-List Filtering

**Files:**
- Modify: `apps/web/src/lib/groups/groups.ts`
- Modify: `apps/web/src/lib/groups/types.ts`
- Modify: `apps/web/src/app/(app)/groups/page.tsx` only if the shared watcher does not fully filter archived squads
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx` only if needed for the same watcher contract
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx` to reject or hide archived squad choices
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- `watchUserGroups` must return only active groups while retaining archived metadata for a direct group-page read.
- `getGroup` and `watchGroupDoc` must expose `archivedAt`, `purgeAfter`, and `archivedBy` in a client-safe shape.

- [ ] **Step 1: Add UI-level tests or pure view-model tests**

  Cover active list filtering, owner-only archive control, confirmation cancellation, successful archive redirect/toast, archived read-only state, restore visibility for the owner, and expired restore error handling using the existing test seams for the page/components. Where the page is not currently mounted in Vitest, extract a small pure view-model helper and test that instead of introducing a new browser harness.

- [ ] **Step 2: Implement client metadata and filtering**

  Filter `archivedAt` groups from dashboard, squad list, and new-session selectors. Do not remove `memberIds` from the archived document because the owner needs to read and restore it.

- [ ] **Step 3: Implement the owner confirmation flow**

  Add `Archive squad` only when `isOwner` and the group is active. Use `useConfirmDialog` with `tone: "danger"` and a description naming the immediate lock and two-day permanent deletion. Call `archiveSquad`, show the existing toast on failure, then redirect to `/dashboard` on success.

- [ ] **Step 4: Implement the archived read-only view**

  Show an archived status/deadline banner, keep session history readable during the window, hide active management controls, and show `Restore squad` only to the current owner while `purgeAfter` is in the future. Call `restoreSquad`, refresh the group state on success, and surface errors through the existing toast.

- [ ] **Step 5: Run focused web tests and typecheck**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck`

## Task 6: Full Verification and Release Gate

**Files:**
- Test only, unless verification exposes a failure in one of the files above.

- [ ] **Step 1: Build shared packages before dependent checks**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/domain build`

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/match-engine build`

- [ ] **Step 2: Run the required workspace checks**

  Run: `corepack pnpm@9.15.9 -r typecheck`

  Run: `corepack pnpm@9.15.9 -r test`

- [ ] **Step 3: Run rules tests when the environment supports them**

  Run: `corepack pnpm@9.15.9 --filter @picklebaddies/web test:rules`

  If the local machine still has no JDK, record that limitation and rely on CI for the emulator-backed rules tests; do not weaken the rules or skip the unit tests.

- [ ] **Step 4: Verify the deployed function inventory and acceptance criteria**

  Confirm the new scheduler is present, existing callables remain exported, active squads can still create/run/score sessions, owners can archive and restore within two days, non-owners cannot, archived reads work, and the cleanup test proves global players/users survive.

- [ ] **Step 5: Move the plan only after completion**

  After all tasks, tests, acceptance checks, and deployment verification pass, move this file to `docs/superpowers/plans/processed/` and commit that move as the final milestone commit.
