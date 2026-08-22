# Empty Squad Session Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give squad owners a clear `Create session` action when the Sessions tab has no matching sessions.

**Architecture:** Reuse the existing empty-state rendering in the squad page and the existing `/sessions/new` route. The action remains local to the empty state, preserving the current tabs and filters; the creation page will receive the squad context only if its existing query contract supports it, otherwise it will open the normal creation form.

**Tech Stack:** Next.js App Router, React, TypeScript, existing inline-style UI system, Vercel production deployment.

## Global Constraints

- Use existing DuoRally visual language and button styles.
- Do not add a second persistent create-session control elsewhere on the squad page.
- Preserve the current session filters and empty-state wording.
- Keep the change scoped to the squad Sessions tab and existing session creation flow.

---

### Task 1: Add the empty-state create action

**Files:**
- Modify: `apps/web/src/app/(app)/groups/[groupId]/page.tsx` near the filtered sessions empty state.

**Interfaces:**
- Consumes: `groupId`, current filtered-session empty state, and existing `/sessions/new` route.
- Produces: An accessible `Create session` link/button shown only when the filtered session list is empty.

- [ ] **Step 1: Update the empty state**

Render the existing empty message followed by a prominent lime `Create session` action. Link it to `/sessions/new`; if the current session form accepts a squad query parameter, include the current `groupId` using that existing parameter convention.

- [ ] **Step 2: Verify the local diff**

Run `git diff --check -- "apps/web/src/app/(app)/groups/[groupId]/page.tsx"` and confirm only the intended empty-state block changed.

### Task 2: Validate and release

**Files:**
- Test: `apps/web` TypeScript project.

**Interfaces:**
- Consumes: Task 1 UI change.
- Produces: A type-safe production deployment.

- [ ] **Step 1: Run the type check**

Run `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit` from `apps/web`. Expected: exit code 0.

- [ ] **Step 2: Deploy to production**

Run `node "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js" vercel deploy --prod -y` from the repository root and report the resulting production alias.

- [ ] **Step 3: Confirm deployment readiness**

Run Vercel inspection for the returned deployment URL and confirm the target is production and status is `Ready`.
