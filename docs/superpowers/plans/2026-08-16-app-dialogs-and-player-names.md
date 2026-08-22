# App Dialogs and Player Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace native browser confirmations with DuoRally dialogs and let registered players choose and change the name shown across DuoRally.

**Architecture:** Reuse the existing `useConfirmDialog` hook in the live organiser page, preserving the current async control flow. Expose only Google account creation in the MVP while retaining the email registration helper for later, use one pure display-name validator, and use an authenticated server action to propagate name changes through denormalised player records.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Auth, Vitest

## Global Constraints

- Preserve the existing mobile bottom-sheet and desktop centred-modal behavior.
- Google is the only account-creation route exposed in the MVP; retain the email registration capability for a later release.
- Never derive a new registered player's visible name from their email address.
- Name changes may update cached labels but must not modify completed scores, outcomes, or player statistics.

---

### Task 1: Live Session Confirmation Dialogs

**Files:**
- Modify: `apps/web/src/app/(app)/sessions/[sessionId]/live/page.tsx`
- Reuse: `apps/web/src/components/ConfirmDialog.tsx`

**Interfaces:**
- Consumes: `useConfirmDialog(): { confirm(options): Promise<boolean>; confirmationDialog: ReactNode }`
- Produces: app-rendered confirmations for roster, guest, session, and court actions

- [ ] **Step 1: Import and initialise the shared hook**

Add `useConfirmDialog` and render `confirmationDialog` once at the page root.

- [ ] **Step 2: Replace native confirmations**

Convert each `confirm(message)` branch to `await requestConfirmation({ title, description, confirmLabel, tone })` while preserving its existing mutation and rebalance behavior.

- [ ] **Step 3: Confirm no browser dialogs remain**

Run: `rg -n '\b(alert|confirm|prompt)\s*\(' apps/web/src`

Expected: no native dialog calls.

### Task 2: Google-Only Signup and Display-Name Rules

**Files:**
- Create: `apps/web/src/lib/auth/display-name.ts`
- Create: `apps/web/src/lib/auth/display-name.test.ts`
- Modify: `apps/web/src/app/sign-in/page.tsx`

**Interfaces:**
- Produces: `normalizePlayerDisplayName(displayName: string): string`
- Produces: a Google-only signup surface with existing-account email sign-in

- [ ] **Step 1: Write registration-name tests**

Test trimming, whitespace normalisation, rejection of blank names, and rejection of names shorter than two characters.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `..\..\node_modules\.bin\vitest.cmd run src/lib/auth/display-name.test.ts`

Expected: FAIL because `normalizePlayerDisplayName` does not exist.

- [ ] **Step 3: Implement shared display-name validation**

Trim and normalise the value used by the account-name editor.

- [ ] **Step 4: Remove email account creation**

Hide the email registration mode and label the email/password form for existing account holders. Retain the underlying registration helper and keep Google as the only visible signup action.

- [ ] **Step 5: Run focused tests**

Run: `..\..\node_modules\.bin\vitest.cmd run src/lib/auth/display-name.test.ts`

Expected: PASS.

### Task 3: Editable Global Player Name

**Files:**
- Create: `apps/web/src/components/PlayerNameDialog.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/lib/auth/AuthProvider.tsx`
- Modify: `apps/web/src/lib/auth/types.ts`
- Modify: `apps/web/src/server/users/actions.ts`

**Interfaces:**
- Produces: `updateMyDisplayName(displayName: string): Promise<ActionResult<void>>`
- Produces: `refreshUser(): Promise<void>` through `useAuth()`

- [ ] **Step 1: Add the authoritative update action**

Validate the new name, update Firebase Auth, and batch-update the user's canonical and denormalised name records. Rewrite only participant labels inside matches; preserve every score, result, status, and statistic.

- [ ] **Step 2: Add the account dialog**

Build an accessible form using the existing responsive dialog surface, with the current name prefilled, inline errors, disabled saving state, and **Save name** action.

- [ ] **Step 3: Connect the header avatar**

Turn the initials avatar into a labelled button, open the dialog, refresh the local Firebase user after saving, and immediately render the updated initials.

- [ ] **Step 4: Verify name propagation types**

Run: `..\..\node_modules\.bin\tsc.cmd --noEmit` from `apps/web`.

Expected: exit code 0.

### Task 4: Checkout Verification and Deployment

**Files:**
- Verify all modified files in the current checkout

**Interfaces:**
- Produces: a type-safe production deployment

- [ ] **Step 1: Run TypeScript verification**

Run: `..\..\node_modules\.bin\tsc.cmd --noEmit` from `apps/web`.

Expected: exit code 0.

- [ ] **Step 2: Check patch integrity**

Run: `git diff --check`

Expected: no whitespace errors; existing CRLF warnings are acceptable.

- [ ] **Step 3: Deploy the complete checkout**

Run: `npx.cmd vercel deploy --prod -y`

Expected: deployment reaches READY and aliases to `https://duorally.com.au`.
