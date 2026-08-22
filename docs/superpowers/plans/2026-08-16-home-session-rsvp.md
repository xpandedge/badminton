# Home Session RSVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Going / Not going controls on every upcoming Home session card and automatically maintain the session roster.

**Architecture:** Expand the authenticated session-summary action to return all sessions for the user's squads plus RSVP state. Keep `rsvpToSession` authoritative for atomic RSVP, roster, leaderboard and aggregate-count updates. Render the interaction directly in dashboard session cards with optimistic rollback.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin Firestore transactions.

## Global Constraints

- Only draft and scheduled sessions accept RSVP changes.
- Active and completed sessions retain navigation actions without RSVP controls.
- Existing player statistics and completed results must never reset.
- Mobile card controls must remain valid interactive HTML without nested buttons inside links.

---

### Task 1: Return squad sessions and RSVP state

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`

- [x] Extend `SessionSummaryData` with RSVP counts and the current user's RSVP state.
- [x] Fetch all sessions for every squad membership.
- [x] Keep managed and member sessions distinct without duplicating sessions.
- [x] Infer Going for an already-active session player when no RSVP document exists.

### Task 2: Make RSVP updates authoritative

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`

- [x] Reject RSVP changes after the session starts.
- [x] Preserve existing player skill and statistics.
- [x] Update RSVP, roster, leaderboard and aggregate counts in one transaction.
- [x] Return the committed status and counts to the client.

### Task 3: Add Home RSVP controls

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`

- [x] Render Going / Not going for each upcoming squad session.
- [x] Support organisers who also want to play.
- [x] Apply optimistic selection and rollback on failure.
- [x] Keep the navigation row separate from RSVP buttons.
- [x] Exclude Not going sessions from the Home focus card.

### Task 4: Verify and release

**Files:**
- Verify: `apps/web/src/server/sessions/actions.ts`
- Verify: `apps/web/src/app/(app)/dashboard/page.tsx`

- [ ] Run the web TypeScript compiler.
- [ ] Run `git diff --check` on touched files.
- [ ] Complete a Vercel production build and confirm READY on duorally.com.au.
