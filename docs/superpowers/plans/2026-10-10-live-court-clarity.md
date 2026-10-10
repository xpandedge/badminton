# Live Court Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live-session court management predictable for older sessions and remove organiser-facing scheduling noise.

**Architecture:** Keep court availability and automatic future-game updates in the existing server actions. The live court component will derive a legacy-safe active flag (`isActive !== false`), sort active courts before disabled courts, and render clear status colours. The live page will invoke the existing update path without confirmation or rebalance-summary modal.

**Tech Stack:** Next.js App Router, React, TypeScript, existing session server actions, Vitest/build checks.

## Global Constraints

- Preserve immutable current and completed match court details.
- Preserve court IDs, permissions, validation, and the derived active court count.
- Treat missing `isActive` on legacy court records as active.
- Do not change the backend scheduling or rebalance algorithm.
- Do not expose implementation terms such as “rebalancing” or “update games” in the organiser flow for automatic updates.

### Task 1: Make court status and ordering legacy-safe

**Files:**
- Modify: `apps/web/src/components/LiveCourts.tsx`

**Interfaces:**
- Consumes: `SessionCourt[]` and the existing `saveLiveCourt`/`onAvailabilityChange` callbacks.
- Produces: an active-first, disabled-last court list with explicit status presentation.

- [ ] **Step 1: Define the legacy-safe status rule**

Use `court.isActive !== false` for display, sorting, colour, button labels, and action selection so older records without the field remain usable courts.

- [ ] **Step 2: Sort courts deterministically**

Sort a copied array by active status first while retaining the existing relative order within each status group.

- [ ] **Step 3: Apply clear visual status treatment**

Use a green/volt-tinted surface and `Active` label for available courts, and a muted/amber-tinted surface with `Disabled` label and reduced emphasis for disabled courts. Keep both controls available to authorised organisers.

- [ ] **Step 4: Verify the component typechecks**

Run `pnpm --filter @picklebaddies/web build` and confirm the component compiles without changing server contracts.

### Task 2: Remove automatic organiser popups

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: existing `updatePlayerStatus`, `addGuestPlayerToSession`, `disableCourt`, and `rebalanceSession` server-backed actions.
- Produces: automatic future-game updates without confirmation dialogs or a “Rebalance Complete” modal.

- [ ] **Step 1: Replace status-change confirmations**

When the server reports `rebalanceRecommended` after a player or court change, call `handleRebalance` directly with the existing trigger rather than asking the organiser to approve “Update games?”.

- [ ] **Step 2: Make court availability updates automatic**

When `LiveCourts` reports an availability change, call `handleRebalance("settings_changed")` directly for non-round-robin sessions.

- [ ] **Step 3: Stop rendering rebalance result copy**

Keep the action error path and busy state, but do not set or render the rebalance summary modal for automatic updates. Remove the unused summary state if no other caller needs it.

- [ ] **Step 4: Verify the live route**

Run `pnpm --filter @picklebaddies/web build` and confirm no “Update the next games?” or “Rebalance Complete” organiser UI remains in this flow.

### Task 3: Final validation

**Files:**
- Test: existing web build and relevant court/rebalance tests.

- [ ] **Step 1: Run focused court tests**

Run `pnpm --filter @picklebaddies/web exec vitest run src/lib/sessions/courts.test.ts src/server/sessions/courts.test.ts`.

- [ ] **Step 2: Run the production build**

Run `pnpm --filter @picklebaddies/web build`.

- [ ] **Step 3: Review the diff**

Run `git diff -- apps/web/src/components/LiveCourts.tsx 'apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx'` and verify only presentation/order and popup behaviour changed.
