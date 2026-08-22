# Dynamic Casual Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm casual RSVP players into every open capacity spot left by regulars.

**Architecture:** Change the domain RSVP bucketing helper so the confirmed casual limit is derived from `totalPlayers - regularsIn.length`. Leave the stored `casualConfirmedSlots` field available for compatibility, but remove it from visible admin/public UI.

**Tech Stack:** TypeScript, Vitest, Next.js App Router.

## Global Constraints

- Do not require a data migration.
- Regulars remain in by default unless away.
- Casual waiting list still works after open spots fill.
- Public RSVP should not show fixed casual slots.

---

### Task 1: Domain Bucketing

**Files:**
- Modify: `packages/domain/src/session-rsvp.ts`
- Modify: `packages/domain/src/session-rsvp.test.ts`

- [x] Change `maxCasualConfirmed` to use only `totalPlayers - regularsIn.length`.
- [x] Update tests to describe filling open capacity rather than fixed casual slots.

### Task 2: Remove Fixed Slots From UI

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/rsvp/[rsvpCode]/page.tsx`

- [x] Remove the visible `Casual confirmed slots` inputs.
- [x] Replace public `Casual slots` stat with `Open spots`.
- [x] Keep server submissions compatible by preserving existing field values internally.

### Task 3: Verification

- [x] Run `node_modules\.bin\tsc.cmd -p packages\domain\tsconfig.json --noEmit`.
- [x] Run `node_modules\.bin\tsc.cmd -p apps\web\tsconfig.json --noEmit`.
- [x] Run `packages/domain` RSVP tests.
