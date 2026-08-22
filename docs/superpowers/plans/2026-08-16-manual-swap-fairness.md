# Manual Swap Fairness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual substitutions influence only future game generation while preserving all displayed matches.

**Architecture:** Keep `swapPlayers` as the sole authoritative match writer. Reconcile the generated rotation record associated with the swapped assignment in the same Firestore transaction and reject players already assigned elsewhere. Preserve the pure match engine's existing lowest-game-load selection.

**Tech Stack:** TypeScript, Vitest, Next.js server actions, Firebase Admin Firestore transactions.

## Global Constraints

- Do not regenerate or edit any displayed match other than the match explicitly changed by the organiser.
- Completed matches remain locked.
- Match-engine code remains pure and deterministic.

---

### Task 1: Confirm lowest-load selection

**Files:**
- Modify: `packages/match-engine/src/round.test.ts`

- [x] Add a regression test where relationship penalties tempt the engine to choose overplayed players.
- [x] Confirm the engine already excludes overplayed players when capacity permits.
- [x] Run the complete match-engine test suite.

### Task 2: Reconcile manual swap bookkeeping

**Files:**
- Modify: `apps/web/src/server/sessions/players.ts`

- [x] Read displayed matches and generated sit-outs in the existing transaction.
- [x] Reject a replacement who is already assigned to another displayed match.
- [x] Move the replacement player's same-cycle sit-out record to the outgoing player.
- [x] Update only the explicitly selected match and audit log.

### Task 3: Verify and release

**Files:**
- Verify: `packages/match-engine/src/round.test.ts`
- Verify: `apps/web/src/server/sessions/players.ts`

- [x] Run focused Vitest coverage.
- [x] Run the web TypeScript compiler.
- [x] Run `git diff --check` on touched files.
- [ ] Deploy the current checkout to DuoRally production and confirm Vercel reports READY.
