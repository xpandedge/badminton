# Session-Only Guest Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the squad guest form add a name-only player to one selected session instead of creating a reusable squad player.

**Architecture:** Reuse the existing `addGuestPlayerToSession` action used by the live session page. The squad page will select from its scheduled, draft, active, and paused sessions, then submit the guest directly to the chosen session. The copy will clarify that session results are available for that guest, while lifetime and overall rankings are not created.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase-backed session actions, existing inline-style UI system, Vercel.

## Global Constraints

- Guests are name-only and do not require an account.
- Guests belong to the selected session only and must not be written to the squad player collection.
- Keep existing signed-in member and live-session guest flows unchanged.
- Use the existing session guest permission checks and session player data model.

---

### Task 1: Convert the squad guest form to session-only

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx`

**Interfaces:**
- Consumes: `sessions`, `SessionSummary`, and `addGuestPlayerToSession` from `@/lib/sessions/rebalance`.
- Produces: A selected-session guest form with clear session-only ranking copy and success/error states.

- [ ] **Step 1: Add selected session state and session guest action import**

Import `addGuestPlayerToSession`, add `selectedGuestSessionId`, and initialize it to the first eligible session when the loaded session list changes.

- [ ] **Step 2: Replace squad guest submission**

Require both a guest name and selected eligible session, call `addGuestPlayerToSession({ sessionId: selectedGuestSessionId, displayName: guestName, skillLevel: guestSkill })`, and keep the existing loading/error/success handling.

- [ ] **Step 3: Update the form controls and copy**

Use the heading `Add a guest`, add a session selector, explain that the guest is available for the selected session only and appears in session results but not lifetime or overall rankings, and label the submit action `Add guest`.

### Task 2: Validate and release

**Files:**
- Test: `apps/web` TypeScript project.

**Interfaces:**
- Consumes: Task 1 UI change.
- Produces: A type-safe production deployment.

- [ ] **Step 1: Run checks**

Run `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit` from `apps/web` and `git diff --check` for the modified source file. Expected: both exit successfully.

- [ ] **Step 2: Deploy to production**

Run `npx.cmd vercel deploy --prod -y` from the repository root and confirm the returned deployment is production and `READY`.
