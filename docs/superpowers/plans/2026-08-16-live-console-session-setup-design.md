# Live Console Session Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (inline execution is approved for this task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live console the organiser's single session workspace by moving pre-session roster setup into it and routing Start Playing directly there.

**Architecture:** Reuse the live console's existing session, squad-player, guest, court, board, and scoring subscriptions. Expand roster management to draft and scheduled sessions, add bulk and individual squad-player controls, and keep the same controls available once play starts. Remove the details-page link from the primary flow by routing session creation and organiser session cards to `/sessions/{id}/live`.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Firebase-backed session actions and inline-style UI.

## Global Constraints

- Leave the current QR and score-link behavior unchanged.
- Preserve existing scoring, courts, board sharing, cancellation, and results behavior.
- Keep both individual player add and `Add all` available.
- Keep guests session-only.
- Do not delete the details route; remove it from the normal organiser workflow so old links remain compatible.

---

### Task 1: Consolidate roster setup into the live console

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

**Interfaces:**
- Consumes: `watchGroupPlayers`, `watchSessionPlayers`, `addGroupMemberToSession`, `addLatePlayer`, `addGuestPlayerToSession`, and `rebalanceSession`.
- Produces: Pre-session and live roster management with individual add, `Add all`, and guest creation.

- [ ] **Step 1: Add shared available-player state and handlers**

Compute squad players not already in the session by both player document ID and linked user ID. Add one handler for individual players and one bulk handler for all currently available players.

- [ ] **Step 2: Render roster controls before and during play**

Show roster management for draft, scheduled, active, and paused sessions. Use `Players` before play and `Roster management` during play; keep status controls limited to live sessions.

- [ ] **Step 3: Keep guest creation in the same section**

Retain the existing session guest action and clarify that the guest belongs to this session only.

### Task 2: Remove the details page from the organiser flow

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: existing session IDs and `/sessions/{id}/live` route.
- Produces: Newly created sessions and organiser session cards open the live console directly.

- [ ] **Step 1: Redirect newly created sessions to the live console**

After creation, navigate to `/sessions/{sessionId}/live`.

- [ ] **Step 2: Update squad session CTA copy**

Keep the existing `/live` href and label draft or scheduled organiser sessions `Start Playing` instead of `View Session`.

### Task 3: Validate and release

- [ ] **Step 1: Run TypeScript and diff checks**

Run `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit` from `apps/web` and `git diff --check` for all modified files.

- [ ] **Step 2: Deploy to production**

Run `npx.cmd vercel deploy --prod -y` and confirm Vercel reports production `READY`.
