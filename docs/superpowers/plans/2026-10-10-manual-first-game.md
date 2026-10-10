# Manual First-Game Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Require an organiser confirmation before every game, including the first game, when manual court progression is enabled.

**Architecture:** Keep the initial generated match documents as `scheduled`, but add a server-authorized transition that starts one scheduled match by setting it to `in_progress`. The live page will show a per-court start control for scheduled matches in manual mode and keep score entry available only for started matches. Automatic mode will retain its current behavior.

**Tech Stack:** Next.js/React client page, Firebase Admin Firestore server actions, TypeScript, Vitest where existing session tests cover scheduling behavior.

## Global Constraints

- Preserve completed matches and existing player/court assignments.
- Reuse existing session permissions and transaction patterns.
- Do not change automatic progression when `manualCourtProgression` is false.
- Run `git diff --check`, focused tests/build checks available in the repository, and `scripts/preflight-release.ps1` before pushing.

---

### Task 1: Add a guarded scheduled-match start action

**Files:**
- Modify: `apps/web/src/server/sessions/actions.ts`
- Modify: `apps/web/src/lib/sessions/live.ts`
- Test: `apps/web/src/server/sessions` existing action/scheduling tests if a focused transaction helper is available

**Interfaces:**
- Produces `startScheduledMatch({ sessionId, matchId })` returning the repository `ActionResult` shape.
- The transaction accepts only a scheduled, unlocked match belonging to the session and only an owner/admin-capable organiser.

- [ ] **Step 1: Inspect existing status-transition and transaction error conventions**

Run:
```powershell
rg -n "updateSessionStatus|FAILED_PRECONDITION|isLocked|matchRef" apps/web/src/server/sessions/actions.ts apps/web/src/server/sessions/score.ts
```

- [ ] **Step 2: Implement the transaction**

Read the session and match, verify the caller can manage the session, verify the session is active or paused, verify the match is `scheduled` and not locked, then update only `status: "in_progress"`, `startedAt`, and the existing audit log fields. Return a typed success result and map not-found, forbidden, and failed-precondition errors consistently with neighboring actions.

- [ ] **Step 3: Add the client wrapper**

Export `startScheduledMatch` from `apps/web/src/lib/sessions/live.ts`, call the server action, throw on `{ ok: false }`, and return `{ data }` like the existing wrappers.

- [ ] **Step 4: Run focused static validation**

Run:
```powershell
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/server/sessions/actions.ts apps/web/src/lib/sessions/live.ts
git commit -m "Add guarded manual match start action"
```

### Task 2: Gate the live UI before every game

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Modify: `apps/web/src/app/(app)/sessions/new/page.tsx`

**Interfaces:**
- Consumes `startScheduledMatch({ sessionId, matchId })` from Task 1.
- Produces per-match start controls and updated setting copy.

- [ ] **Step 1: Add per-match start state and handler**

Add a `startingMatchId` state and a handler that calls `startScheduledMatch`, reports the existing `actionError`, and clears its busy state in `finally`.

- [ ] **Step 2: Render the manual start state**

For a scheduled, unlocked match in manual progression mode, render the players and a clear “Start game” button. Do not render score entry until the match status is `in_progress`. Keep automatic mode’s scheduled match card and score flow unchanged.

- [ ] **Step 3: Remove the initial automatic start only for manual mode**

In `handleStart`, generate the initial schedule as today, then call `startSession` as today so the session enters the live state. The scheduled matches remain waiting because their explicit transition is now required before scoring.

- [ ] **Step 4: Update the option copy**

Change the new-session label to `Ask before starting each game` and supporting text to explain that the organiser chooses when the first and subsequent games begin.

- [ ] **Step 5: Validate UI invariants**

Run:
```powershell
git diff --check
rg -n "Ask before starting each game|Start game|startScheduledMatch|startingMatchId" apps/web/src/app apps/web/src/lib apps/web/src/server
```

Expected: the new copy and handler are present; the old “next game” setting copy is absent.

- [ ] **Step 6: Commit**

```powershell
git add "apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx" "apps/web/src/app/(app)/sessions/new/page.tsx"
git commit -m "Require confirmation before every manual game"
```

### Task 3: Verify and release

**Files:**
- Modify: `docs/plans/2026-10-10-manual-first-game-design.md` only if validation notes need recording

- [ ] **Step 1: Run repository checks**

Run the focused session tests and the repository build command available in the workspace. If local dependency scripts are blocked by the existing pnpm build-script policy, record that limitation and rely on the Vercel build for deployment validation.

- [ ] **Step 2: Confirm the clean release branch**

Run:
```powershell
git status --short --branch
pwsh -File scripts/preflight-release.ps1
```

Expected: clean `main` and `RELEASE_PREFLIGHT=READY`.

- [ ] **Step 3: Push main and verify Vercel**

```powershell
git push origin main
```

Inspect the deployment until it reports `READY`; verify the production aliases remain attached.

- [ ] **Step 4: Record the release result**

Report the commits, deployment ID/status, and the distinction between the clean release workspace and the preserved dirty original checkout.
