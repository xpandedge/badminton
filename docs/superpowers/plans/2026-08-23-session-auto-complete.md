# Session Auto-Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically complete forgotten active or paused sessions during the existing daily cleanup.

**Architecture:** Store the first real start time in both lifecycle writers. Add a pure-in-purpose Firestore helper for bounded stale-session cleanup and invoke it from the existing `purgeArchivedSquads` schedule. Do not create another scheduler.

**Tech Stack:** Firebase Functions v2 scheduler, Firebase Admin Firestore, Next.js server actions, TypeScript, Vitest emulator tests.

### Task 1: Record session start time

**Files:**
- Modify: `functions/src/sessionLifecycle.ts`
- Modify: `apps/web/src/server/sessions/actions.ts`

- [ ] Write `startedAt` only for the first transition into `active`.
- [ ] Preserve `startedAt` across pause/resume and manual completion.

### Task 2: Add daily stale-session cleanup

**Files:**
- Add: `functions/src/autoCompleteStaleSessions.ts`
- Modify: `functions/src/purgeArchivedSquads.ts`
- Add: `functions/src/__tests__/sessionAutoComplete.test.ts`

- [ ] Scan active/paused sessions during the existing daily job.
- [ ] Re-read candidates in a transaction and complete only sessions at least 24 hours old.
- [ ] Write an audit record and keep match/stat documents unchanged.
- [ ] Use `updatedAt` only as a fallback for legacy sessions without `startedAt`.

### Task 3: Verify and release

- [ ] Run functions and web typechecks/tests and build functions.
- [ ] Review the diff and confirm no new scheduled function was added.
- [ ] Commit, push, deploy Vercel/Firebase, and verify the workflow.
