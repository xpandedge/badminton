# Session Roster Guest And Add All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (inline execution is approved for this task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep session participation controls inside the session and let organisers add all available squad players at once.

**Architecture:** Extend the existing session detail roster panel, which already owns individual player adds. Add a client-side bulk action that reuses the existing authorised `addGroupMemberToSession` action for each roster player, plus a session-only guest form that reuses `addGuestPlayerToSession`. Remove the standalone guest form from the squad page.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Firebase-backed server actions and inline-style UI.

## Global Constraints

- Keep individual `Add` buttons available.
- Add guests directly to the current session only.
- Do not create guests in the squad player collection from the squad page.
- Preserve existing permission checks and live-session rebalance behavior.

---

### Task 1: Move guest creation and add-all into the session roster

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `rosterNotInSession`, `addGroupMemberToSession`, `addGuestPlayerToSession`, and `rebalanceSession`.
- Produces: `Add all available` bulk action, individual roster adds, and inline `Add a guest` form.

- [ ] **Step 1: Add bulk and guest state**

Track bulk loading, guest name, guest skill, guest loading, and guest errors independently from the existing individual add state.

- [ ] **Step 2: Implement bulk add**

Call `addGroupMemberToSession(sessionId, playerId)` for every current `rosterNotInSession` player, keep the individual buttons usable after completion, and show a useful error if any add fails.

- [ ] **Step 3: Implement session-only guest add**

Call `addGuestPlayerToSession({ sessionId, displayName, skillLevel })`; if the result recommends rebalancing, call `rebalanceSession({ sessionId, trigger: "player_added" })`.

- [ ] **Step 4: Update roster UI**

Place `Add all available` in the `Not joined yet` header, retain each row’s `Add` button, and render an inline guest form below the roster with copy explaining session-only results and no lifetime/overall ranking.

### Task 2: Remove the misleading squad-level entry point

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: existing squad member management UI.
- Produces: No standalone guest/session participation form on the squad page.

- [ ] **Step 1: Remove the Add players section**

Remove the visible guest form and its now-unused state/imports from the squad page while leaving invite sharing and member management unchanged.

### Task 3: Validate and release

- [ ] **Step 1: Run TypeScript and diff checks**

Run `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit` from `apps/web` and `git diff --check` for both modified pages.

- [ ] **Step 2: Deploy to production**

Run `npx.cmd vercel deploy --prod -y` and confirm Vercel reports the production deployment `READY`.
