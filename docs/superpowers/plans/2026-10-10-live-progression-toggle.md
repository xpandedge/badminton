# Live Progression Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an organiser-only live-session toggle for manual versus automatic game progression.

**Architecture:** Add a server transaction that updates `manualCourtProgression` only for active or paused sessions and writes an audit event. The live page calls that action; when manual mode is disabled it invokes the existing `rebalanceSession` action to fill empty courts immediately. Existing scheduled/in-progress and completed matches are preserved.

**Tech Stack:** Next.js/React, Firebase Admin Firestore, TypeScript.

## Global Constraints

- Preserve completed, locked, scheduled, and in-progress match assignments.
- Enforce existing owner/admin session-control permissions server-side.
- Do not alter draft creation defaults or completed-session behavior.
- Run `git diff --check`, release preflight, and Vercel production verification.

---

### Task 1: Add the guarded live setting action

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/lib/sessions/live.ts`

- [ ] **Step 1: Add `updateLiveProgression(sessionId, manualCourtProgression)`**

Require authentication and active squad membership, read the session and group membership in a transaction, require `canCreateSession(role)`, and allow only `active` or `paused` status. Update only `manualCourtProgression` and `updatedAt`, then append an audit log with action `session/progression_changed` and the new value.

- [ ] **Step 2: Add the client wrapper**

Export a wrapper from `apps/web/src/lib/sessions/live.ts` that throws the server result message on failure and returns `{ data }` on success.

- [ ] **Step 3: Run static validation**

```powershell
git diff --check
```

### Task 2: Add the live toggle and immediate auto-fill

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`

- [ ] **Step 1: Add busy state and handler**

Add `isUpdatingProgression` and a handler that saves the requested value. If the requested value is `false`, call `handleRebalance("settings_changed")` after the save. Keep the existing action error and finally cleanup behavior.

- [ ] **Step 2: Render concise control**

In the session control section, for `canControlSession` and active/paused sessions, render a checkbox labelled `Manual game starts` with helper text `Start each game yourself.` Disable it while saving and expose `aria-busy`.

- [ ] **Step 3: Verify invariants**

```powershell
git diff --check
rg -n "Manual game starts|updateLiveProgression|settings_changed|isUpdatingProgression" apps/web/src
```

### Task 3: Verify and release

**Files:** None beyond the implementation files above.

- [ ] **Step 1: Run available focused checks**

Run the web checks available in the workspace. If pnpm is blocked by its existing ignored-build policy, record that limitation and rely on the Vercel build.

- [ ] **Step 2: Commit and push**

```powershell
git add apps/web/src/server/sessions/actions.ts apps/web/src/lib/sessions/live.ts "apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx"
git commit -m "Add live manual progression toggle"
git push origin main
```

- [ ] **Step 3: Run preflight after push and verify Vercel is READY**

Run `pwsh -File scripts/preflight-release.ps1`, inspect the latest production deployment, and report its ID and aliases.
