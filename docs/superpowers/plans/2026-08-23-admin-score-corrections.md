# Admin Score Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners/admins correct completed scores during an active or paused session with server enforcement and visible traceability.

**Architecture:** Reuse `submitScore` for both first entry and corrections. The server distinguishes completed-match edits, requires an admin-level group role, reverses the previous aggregate delta, applies the new delta, stores the latest correction metadata on the match, and appends a session audit log. The live results card exposes the correction only when the session is active/paused and the viewer can manage the session.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin Firestore, Vitest.

## Global Constraints

- Score entry remains available to squad members.
- Score correction is available only to owners, admins, or legacy `organiser` records.
- Corrections are blocked after the session is completed or cancelled.
- Existing session/global aggregate reconciliation must remain transactional.
- Do not expose or store service-account credentials.

---

### Task 1: Enforce and audit corrections on the server

**Files:**
- Modify: `apps/web/src/server/sessions/score.ts`
- Test: `apps/web/src/server/sessions/score.test.ts` or the existing focused server test setup if present.

**Interfaces:**
- Consumes: `SubmitScoreInput`, `canCreateSession`, existing aggregate delta helpers, and the session member document.
- Produces: the same `ActionResult<void>` plus match metadata fields `scoreEditedAt`, `scoreEditedBy`, `scoreEditedByName`, `scoreEditedByInitials`, and `scoreEditedFrom` when a correction succeeds.

- [ ] **Step 1: Add the correction permission check**

After reading the match and member role, derive `isEdit = match.status === "completed"`. Keep `canEnterScore(role)` for first entry, then reject edits unless `canCreateSession(role)` is true with a `FORBIDDEN` result.

- [ ] **Step 2: Record correction identity and old/new values**

Use the member document's display name with `Squad admin` as fallback, derive initials from the name, and write the previous winner/payload, new winner/payload, editor UID, display name, and initials into both the match metadata and `sessions/{sessionId}/auditLogs/{logId}` in the same transaction.

- [ ] **Step 3: Add focused permission and audit tests**

Cover member rejection for a completed match, admin acceptance, and preservation of previous/new result metadata. Keep the existing aggregate reversal assertions in place or add them if the current test harness lacks them.

### Task 2: Add the admin correction control to the live results card

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify: `apps/web/src/lib/sessions/scoring.ts` only if the client wrapper needs a correction-specific name; otherwise leave it unchanged.

**Interfaces:**
- Consumes: existing `enterScore`, `canManageSessionPlayers`, match metadata, and active/paused session state.
- Produces: an owner/admin-only `Edit score` action for completed cards, reused score inputs, and a focusable info icon describing the latest correction.

- [ ] **Step 1: Add edit state and score formatting**

Track the match IDs currently being edited, preload the current point payload when entering edit mode, and add a small formatter for winner-only and points results so the correction tooltip can say what changed.

- [ ] **Step 2: Reuse score submission for corrections**

Render `Edit score` only when `session.status` is `active` or `paused`, the match is completed, and the viewer is an admin-level role. On save, call the existing `enterScore`, clear edit state, and retain the loading/error behavior used by first-time score entry.

- [ ] **Step 3: Render traceability metadata**

When a match has `scoreEditedByName`, render a small information icon with `title` and `aria-label` text containing the editor and previous/current result. Keep it visible on completed cards for members as read-only context.

### Task 3: Verify and release

**Files:**
- Verify: `apps/web/src/server/sessions/score.ts`, `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`, and related tests.

- [ ] **Step 1: Run focused verification**

Run `corepack pnpm@9.15.9 --filter @picklebaddies/web typecheck` and `corepack pnpm@9.15.9 --filter @picklebaddies/web test`. Expected: both pass.

- [ ] **Step 2: Review the diff**

Run `git diff --check` and confirm no unrelated files changed.

- [ ] **Step 3: Commit and push**

Commit with `git add` for only the score correction files and docs, then `git commit -m "Allow admins to correct active session scores"` with the repository's co-author trailer, followed by `git push origin main` after verification.
